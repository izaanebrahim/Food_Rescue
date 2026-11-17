-- =====================================================================
-- Food Rescue — 03_triggers.sql
-- Business rules enforced inside the database.
-- =====================================================================
USE food_rescue;

DELIMITER $$

-- ---------------------------------------------------------------------
-- New users: donors and admins are trusted; NGOs and volunteers must
-- be verified before they can claim (see fn_claim_block_reason).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_users_bi $$
CREATE TRIGGER trg_users_bi
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
    SET NEW.email = LOWER(TRIM(NEW.email));
    IF NEW.role IN ('donor','admin') THEN
        SET NEW.verification_status = 'verified';
    ELSEIF NEW.verification_status = 'verified' AND @fr_seeding IS NULL THEN
        -- Nobody can sign up as already-verified through the app.
        SET NEW.verification_status = 'unverified';
    END IF;
END $$

-- ---------------------------------------------------------------------
-- Food safety on new listings.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_listings_bi $$
CREATE TRIGGER trg_listings_bi
BEFORE INSERT ON food_listings
FOR EACH ROW
BEGIN
    DECLARE v_role VARCHAR(20);
    SELECT role INTO v_role FROM users WHERE user_id = NEW.donor_id;

    IF v_role <> 'donor' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only donor accounts can list food';
    END IF;
    IF @fr_seeding IS NULL AND NEW.prepared_at > NOW() + INTERVAL 10 MINUTE THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prepared time cannot be in the future';
    END IF;
    IF @fr_seeding IS NULL AND NEW.expires_at < NOW() + INTERVAL 60 MINUTE THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Food must stay safe for at least 60 more minutes to be listed';
    END IF;
    IF NEW.category = 'cooked' AND TIMESTAMPDIFF(HOUR, NEW.prepared_at, NEW.expires_at) > 12 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cooked food can be listed for at most 12 hours after preparation';
    END IF;
END $$

-- ---------------------------------------------------------------------
-- Every new listing gets its first audit entry.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_listings_ai $$
CREATE TRIGGER trg_listings_ai
AFTER INSERT ON food_listings
FOR EACH ROW
BEGIN
    INSERT INTO status_log (listing_id, old_status, new_status, changed_at)
    VALUES (NEW.listing_id, NULL, NEW.status, NEW.created_at);
END $$

-- ---------------------------------------------------------------------
-- Status changes: allowed transitions only.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_listings_bu $$
CREATE TRIGGER trg_listings_bu
BEFORE UPDATE ON food_listings
FOR EACH ROW
BEGIN
    IF NEW.status <> OLD.status AND NOT (
           (OLD.status = 'available' AND NEW.status IN ('claimed','expired','cancelled'))
        OR (OLD.status = 'claimed'   AND NEW.status IN ('available','picked_up','expired','cancelled'))
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This status change is not allowed';
    END IF;
END $$

-- ---------------------------------------------------------------------
-- After a status change: audit log + notifications.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_listings_au $$
CREATE TRIGGER trg_listings_au
AFTER UPDATE ON food_listings
FOR EACH ROW
BEGIN
    DECLARE v_claimant INT UNSIGNED;
    DECLARE v_claimant_name VARCHAR(150);

    IF NEW.status <> OLD.status THEN
        INSERT INTO status_log (listing_id, old_status, new_status)
        VALUES (NEW.listing_id, OLD.status, NEW.status);

        IF NEW.status = 'expired' THEN
            INSERT INTO notifications (user_id, listing_id, type, message)
            VALUES (NEW.donor_id, NEW.listing_id, 'listing_expired',
                    CONCAT('"', NEW.title, '" expired before anyone collected it.'));
        END IF;

        IF NEW.status = 'picked_up' THEN
            SELECT c.claimant_id, COALESCE(u.org_name, u.full_name)
              INTO v_claimant, v_claimant_name
              FROM claims c JOIN users u ON u.user_id = c.claimant_id
             WHERE c.listing_id = NEW.listing_id AND c.status = 'completed'
             ORDER BY c.picked_up_at DESC LIMIT 1;

            INSERT INTO notifications (user_id, listing_id, type, message)
            VALUES (NEW.donor_id, NEW.listing_id, 'picked_up',
                    CONCAT(v_claimant_name, ' collected ', NEW.quantity_servings,
                           ' servings of "', NEW.title, '". Thank you.'));
        END IF;
    END IF;
END $$

-- ---------------------------------------------------------------------
-- Claims: only verified, non-suspended NGOs/volunteers, and only on
-- food that is still available. (sp_claim_listing checks this too;
-- the trigger makes the rule impossible to bypass.)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_claims_bi $$
CREATE TRIGGER trg_claims_bi
BEFORE INSERT ON claims
FOR EACH ROW
BEGIN
    DECLARE v_reason VARCHAR(80);
    DECLARE v_status VARCHAR(20);
    DECLARE v_expires DATETIME;

    SET v_reason = fn_claim_block_reason(NEW.claimant_id);
    IF v_reason <> 'OK' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_reason;
    END IF;

    SELECT status, expires_at INTO v_status, v_expires
      FROM food_listings WHERE listing_id = NEW.listing_id;

    IF @fr_seeding IS NULL AND v_expires <= NOW() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This food has expired';
    END IF;
END $$

-- ---------------------------------------------------------------------
-- New claim: tell the donor who is coming.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_claims_ai $$
CREATE TRIGGER trg_claims_ai
AFTER INSERT ON claims
FOR EACH ROW
BEGIN
    DECLARE v_donor INT UNSIGNED;
    DECLARE v_title VARCHAR(120);
    DECLARE v_name VARCHAR(150);

    IF @fr_seeding IS NULL THEN
        SELECT l.donor_id, l.title INTO v_donor, v_title
          FROM food_listings l WHERE l.listing_id = NEW.listing_id;
        SELECT COALESCE(org_name, full_name) INTO v_name
          FROM users WHERE user_id = NEW.claimant_id;

        INSERT INTO notifications (user_id, listing_id, type, message)
        VALUES (v_donor, NEW.listing_id, 'listing_claimed',
                CONCAT(v_name, ' claimed "', v_title, '" and will collect by ',
                       DATE_FORMAT(NEW.pickup_deadline, '%l:%i %p'),
                       '. Ask for pickup code ', NEW.pickup_code, '.')),
               (NEW.claimant_id, NEW.listing_id, 'claim_confirmed',
                CONCAT('You claimed "', v_title, '". Collect by ',
                       DATE_FORMAT(NEW.pickup_deadline, '%l:%i %p'),
                       ' and show pickup code ', NEW.pickup_code, '.'));
    END IF;
END $$

-- ---------------------------------------------------------------------
-- Released claims (missed deadline) count as a no-show. Three or more
-- pauses the account for 24 hours.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_claims_au $$
CREATE TRIGGER trg_claims_au
AFTER UPDATE ON claims
FOR EACH ROW
BEGIN
    DECLARE v_count TINYINT UNSIGNED;

    IF OLD.status = 'active' AND NEW.status = 'released' THEN
        UPDATE users SET no_show_count = no_show_count + 1
         WHERE user_id = NEW.claimant_id;

        SELECT no_show_count INTO v_count FROM users WHERE user_id = NEW.claimant_id;

        INSERT INTO notifications (user_id, listing_id, type, message)
        VALUES (NEW.claimant_id, NEW.listing_id, 'claim_released',
                'You missed the pickup deadline, so the food was offered to others.');

        IF v_count >= 3 THEN
            UPDATE users SET suspended_until = NOW() + INTERVAL 1 DAY, no_show_count = 0
             WHERE user_id = NEW.claimant_id;
            INSERT INTO notifications (user_id, listing_id, type, message)
            VALUES (NEW.claimant_id, NULL, 'account_suspended',
                    'Claiming is paused for 24 hours after 3 missed pickups.');
        END IF;
    END IF;
END $$

-- ---------------------------------------------------------------------
-- Submitting documents moves the user to "pending".
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_vr_ai $$
CREATE TRIGGER trg_vr_ai
AFTER INSERT ON verification_requests
FOR EACH ROW
BEGIN
    UPDATE users SET verification_status = 'pending'
     WHERE user_id = NEW.user_id AND verification_status IN ('unverified','rejected');
END $$

-- ---------------------------------------------------------------------
-- Feedback only for completed pickups.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_feedback_bi $$
CREATE TRIGGER trg_feedback_bi
BEFORE INSERT ON feedback
FOR EACH ROW
BEGIN
    IF (SELECT status FROM claims WHERE claim_id = NEW.claim_id) <> 'completed' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Feedback can only be left after pickup';
    END IF;
END $$

DELIMITER ;
