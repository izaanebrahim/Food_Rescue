-- =====================================================================
-- Food Rescue — 04_procedures.sql
-- Every state change the app makes goes through one of these.
-- Each runs as a single transaction with row locks (SELECT ... FOR
-- UPDATE) and rolls back on any error.
-- =====================================================================
USE food_rescue;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Claim a listing. Two NGOs pressing "Claim" at the same moment:
-- the first locks the row; the second waits, then sees status
-- 'claimed' and gets an error. Only one claim can ever win.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_claim_listing $$
CREATE PROCEDURE sp_claim_listing(
    IN  p_listing_id   INT UNSIGNED,
    IN  p_claimant_id  INT UNSIGNED,
    IN  p_window_min   SMALLINT UNSIGNED,      -- minutes allowed to collect
    OUT p_claim_id     INT UNSIGNED,
    OUT p_pickup_code  CHAR(4),
    OUT p_deadline     DATETIME
)
BEGIN
    DECLARE v_status  VARCHAR(20);
    DECLARE v_expires DATETIME;
    DECLARE v_reason  VARCHAR(80);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET v_reason = fn_claim_block_reason(p_claimant_id);
    IF v_reason <> 'OK' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_reason;
    END IF;

    START TRANSACTION;

        SELECT status, expires_at INTO v_status, v_expires
          FROM food_listings
         WHERE listing_id = p_listing_id
           FOR UPDATE;

        IF v_status IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listing not found';
        ELSEIF v_status <> 'available' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Someone else has already claimed this food';
        ELSEIF v_expires <= NOW() THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This food has expired';
        END IF;

        -- Deadline: the requested window, but never after the food expires.
        SET p_deadline    = LEAST(NOW() + INTERVAL COALESCE(p_window_min, 45) MINUTE, v_expires);
        SET p_pickup_code = LPAD(FLOOR(RAND() * 10000), 4, '0');

        UPDATE food_listings SET status = 'claimed' WHERE listing_id = p_listing_id;

        INSERT INTO claims (listing_id, claimant_id, pickup_code, pickup_deadline)
        VALUES (p_listing_id, p_claimant_id, p_pickup_code, p_deadline);

        SET p_claim_id = LAST_INSERT_ID();

    COMMIT;
END $$

-- ---------------------------------------------------------------------
-- Donor confirms handover by entering the claimer's pickup code.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_confirm_pickup $$
CREATE PROCEDURE sp_confirm_pickup(
    IN p_listing_id INT UNSIGNED,
    IN p_donor_id   INT UNSIGNED,
    IN p_code       CHAR(4)
)
BEGIN
    DECLARE v_owner   INT UNSIGNED;
    DECLARE v_claim   INT UNSIGNED;
    DECLARE v_code    CHAR(4);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

        SELECT donor_id INTO v_owner FROM food_listings
         WHERE listing_id = p_listing_id FOR UPDATE;

        IF v_owner IS NULL OR v_owner <> p_donor_id THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can only confirm pickups for your own listings';
        END IF;

        SELECT claim_id, pickup_code INTO v_claim, v_code
          FROM claims
         WHERE listing_id = p_listing_id AND status = 'active'
           FOR UPDATE;

        IF v_claim IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This listing has no active claim';
        ELSEIF v_code <> p_code THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pickup code does not match';
        END IF;

        UPDATE claims
           SET status = 'completed', picked_up_at = NOW(), closed_at = NOW()
         WHERE claim_id = v_claim;

        UPDATE food_listings SET status = 'picked_up' WHERE listing_id = p_listing_id;

    COMMIT;
END $$

-- ---------------------------------------------------------------------
-- Claimer cancels (no penalty if done before the deadline).
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_cancel_claim $$
CREATE PROCEDURE sp_cancel_claim(
    IN p_claim_id    INT UNSIGNED,
    IN p_claimant_id INT UNSIGNED
)
BEGIN
    DECLARE v_owner   INT UNSIGNED;
    DECLARE v_listing INT UNSIGNED;
    DECLARE v_status  VARCHAR(20);
    DECLARE v_expires DATETIME;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

        SELECT claimant_id, listing_id, status INTO v_owner, v_listing, v_status
          FROM claims WHERE claim_id = p_claim_id FOR UPDATE;

        IF v_owner IS NULL OR v_owner <> p_claimant_id THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Claim not found';
        ELSEIF v_status <> 'active' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This claim is no longer active';
        END IF;

        UPDATE claims SET status = 'cancelled', closed_at = NOW() WHERE claim_id = p_claim_id;

        SELECT expires_at INTO v_expires FROM food_listings WHERE listing_id = v_listing FOR UPDATE;
        UPDATE food_listings
           SET status = IF(v_expires > NOW(), 'available', 'expired')
         WHERE listing_id = v_listing;

    COMMIT;
END $$

-- ---------------------------------------------------------------------
-- Donor withdraws a listing (closes any active claim too).
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_cancel_listing $$
CREATE PROCEDURE sp_cancel_listing(
    IN p_listing_id INT UNSIGNED,
    IN p_donor_id   INT UNSIGNED
)
BEGIN
    DECLARE v_owner  INT UNSIGNED;
    DECLARE v_status VARCHAR(20);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
        SELECT donor_id, status INTO v_owner, v_status
          FROM food_listings WHERE listing_id = p_listing_id FOR UPDATE;

        IF v_owner IS NULL OR v_owner <> p_donor_id THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listing not found';
        ELSEIF v_status NOT IN ('available','claimed') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only open listings can be withdrawn';
        END IF;

        UPDATE claims SET status = 'cancelled', closed_at = NOW()
         WHERE listing_id = p_listing_id AND status = 'active';

        UPDATE food_listings SET status = 'cancelled' WHERE listing_id = p_listing_id;
    COMMIT;
END $$

-- ---------------------------------------------------------------------
-- Admin approves or rejects a verification request.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_review_verification $$
CREATE PROCEDURE sp_review_verification(
    IN p_request_id INT UNSIGNED,
    IN p_admin_id   INT UNSIGNED,
    IN p_decision   VARCHAR(10),     -- 'approved' | 'rejected'
    IN p_remarks    VARCHAR(255)
)
BEGIN
    DECLARE v_user   INT UNSIGNED;
    DECLARE v_status VARCHAR(20);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF (SELECT role FROM users WHERE user_id = p_admin_id) <> 'admin' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only admins can review verifications';
    END IF;
    IF p_decision NOT IN ('approved','rejected') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Decision must be approved or rejected';
    END IF;
    IF p_decision = 'rejected' AND (p_remarks IS NULL OR TRIM(p_remarks) = '') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Give a reason when rejecting';
    END IF;

    START TRANSACTION;
        SELECT user_id, status INTO v_user, v_status
          FROM verification_requests WHERE request_id = p_request_id FOR UPDATE;

        IF v_user IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request not found';
        ELSEIF v_status <> 'pending' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This request was already reviewed';
        END IF;

        UPDATE verification_requests
           SET status = p_decision, remarks = NULLIF(TRIM(p_remarks), ''),
               reviewed_by = p_admin_id, reviewed_at = NOW()
         WHERE request_id = p_request_id;

        UPDATE users
           SET verification_status = IF(p_decision = 'approved', 'verified', 'rejected')
         WHERE user_id = v_user;

        INSERT INTO notifications (user_id, type, message)
        VALUES (v_user,
                IF(p_decision = 'approved', 'verification_approved', 'verification_rejected'),
                IF(p_decision = 'approved',
                   'Your account is verified. You can now claim food.',
                   CONCAT('Verification was not approved: ', p_remarks, ' You can submit again.')));
    COMMIT;
END $$

-- ---------------------------------------------------------------------
-- Nearby available food, closest first. Uses a bounding box on the
-- (lat, lng) index first, then exact sphere distance.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_nearby_listings $$
CREATE PROCEDURE sp_nearby_listings(
    IN p_lat       DECIMAL(9,6),
    IN p_lng       DECIMAL(9,6),
    IN p_radius_km DECIMAL(6,2),
    IN p_food_type VARCHAR(10)       -- NULL = any
)
BEGIN
    DECLARE v_dlat DECIMAL(9,6) DEFAULT p_radius_km / 111.0;
    DECLARE v_dlng DECIMAL(9,6) DEFAULT p_radius_km / (111.0 * COS(RADIANS(p_lat)));

    SELECT * FROM (
        SELECT a.*, fn_distance_km(p_lat, p_lng, a.lat, a.lng) AS distance_km
          FROM v_available_listings a
         WHERE a.lat BETWEEN p_lat - v_dlat AND p_lat + v_dlat
           AND a.lng BETWEEN p_lng - v_dlng AND p_lng + v_dlng
           AND (p_food_type IS NULL OR a.food_type = p_food_type)
    ) x
    WHERE x.distance_km <= p_radius_km
    ORDER BY x.distance_km, x.minutes_left;
END $$

-- ---------------------------------------------------------------------
-- Housekeeping, run by the events in 05_events.sql.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_expire_listings $$
CREATE PROCEDURE sp_expire_listings()
BEGIN
    -- Close claims on food that has gone past its safe time. (Missed
    -- deadlines are handled by sp_release_missed_pickups, which runs
    -- every minute, so this is only a safety net and is not a no-show.)
    UPDATE claims c
      JOIN food_listings l ON l.listing_id = c.listing_id
       SET c.status = 'cancelled', c.closed_at = NOW()
     WHERE c.status = 'active' AND l.expires_at <= NOW();

    UPDATE food_listings
       SET status = 'expired'
     WHERE status IN ('available','claimed') AND expires_at <= NOW();
END $$

DROP PROCEDURE IF EXISTS sp_release_missed_pickups $$
CREATE PROCEDURE sp_release_missed_pickups()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_claim INT UNSIGNED;
    DECLARE v_listing INT UNSIGNED;
    DECLARE cur CURSOR FOR
        SELECT claim_id, listing_id FROM claims
         WHERE status = 'active' AND pickup_deadline <= NOW();
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    -- 15-minute reminders first.
    INSERT INTO notifications (user_id, listing_id, type, message)
    SELECT c.claimant_id, c.listing_id, 'pickup_reminder',
           CONCAT('Reminder: collect "', l.title, '" by ',
                  DATE_FORMAT(c.pickup_deadline, '%l:%i %p'), '. Pickup code ', c.pickup_code, '.')
      FROM claims c JOIN food_listings l ON l.listing_id = c.listing_id
     WHERE c.status = 'active' AND c.reminder_sent = FALSE
       AND c.pickup_deadline BETWEEN NOW() AND NOW() + INTERVAL 15 MINUTE;

    UPDATE claims SET reminder_sent = TRUE
     WHERE status = 'active' AND reminder_sent = FALSE
       AND pickup_deadline BETWEEN NOW() AND NOW() + INTERVAL 15 MINUTE;

    -- Then release missed pickups one by one, each in its own transaction.
    OPEN cur;
    release_loop: LOOP
        FETCH cur INTO v_claim, v_listing;
        IF done THEN LEAVE release_loop; END IF;

        START TRANSACTION;
            UPDATE claims SET status = 'released', closed_at = NOW()
             WHERE claim_id = v_claim AND status = 'active';
            UPDATE food_listings
               SET status = IF(expires_at > NOW(), 'available', 'expired')
             WHERE listing_id = v_listing AND status = 'claimed';
        COMMIT;
    END LOOP;
    CLOSE cur;
END $$

DELIMITER ;
