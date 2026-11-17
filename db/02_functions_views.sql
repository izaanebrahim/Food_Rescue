-- =====================================================================
-- Food Rescue — 02_functions_views.sql
-- Stored functions and views (including CTEs and window functions).
-- =====================================================================
USE food_rescue;

DELIMITER $$

-- Great-circle distance in km between two lat/lng pairs.
-- ST_Distance_Sphere works on POINT(longitude, latitude) and returns metres.
DROP FUNCTION IF EXISTS fn_distance_km $$
CREATE FUNCTION fn_distance_km(lat1 DECIMAL(9,6), lng1 DECIMAL(9,6),
                               lat2 DECIMAL(9,6), lng2 DECIMAL(9,6))
RETURNS DECIMAL(8,2)
DETERMINISTIC NO SQL
BEGIN
    IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN ROUND(ST_Distance_Sphere(POINT(lng1, lat1), POINT(lng2, lat2)) / 1000, 2);
END $$

-- Can this user claim food right now? Returns a reason, or 'OK'.
DROP FUNCTION IF EXISTS fn_claim_block_reason $$
CREATE FUNCTION fn_claim_block_reason(p_user_id INT UNSIGNED)
RETURNS VARCHAR(80)
READS SQL DATA
BEGIN
    DECLARE v_role VARCHAR(20);
    DECLARE v_status VARCHAR(20);
    DECLARE v_susp DATETIME;

    SELECT role, verification_status, suspended_until
      INTO v_role, v_status, v_susp
      FROM users WHERE user_id = p_user_id;

    IF v_role IS NULL THEN RETURN 'User not found'; END IF;
    IF v_role NOT IN ('ngo','volunteer') THEN RETURN 'Only NGOs and volunteers can claim food'; END IF;
    IF v_status <> 'verified' THEN RETURN 'Your account must be verified before claiming food'; END IF;
    IF v_susp IS NOT NULL AND v_susp > NOW() THEN RETURN 'Claiming is paused after repeated missed pickups'; END IF;
    RETURN 'OK';
END $$

DELIMITER ;

-- ---------------------------------------------------------------------
-- Listings anyone can see: available and not yet expired.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_available_listings AS
SELECT  l.listing_id, l.title, l.description, l.food_type, l.category,
        l.quantity_servings, l.prepared_at, l.expires_at,
        l.pickup_address, l.lat, l.lng, l.pickup_notes, l.created_at,
        TIMESTAMPDIFF(MINUTE, NOW(), l.expires_at)          AS minutes_left,
        TIMESTAMPDIFF(MINUTE, l.prepared_at, l.expires_at)  AS shelf_minutes,
        u.user_id  AS donor_id,
        COALESCE(u.org_name, u.full_name) AS donor_name
FROM    food_listings l
JOIN    users u ON u.user_id = l.donor_id
WHERE   l.status = 'available'
  AND   l.expires_at > NOW();

-- ---------------------------------------------------------------------
-- Contact details for both sides of an ACTIVE claim.
-- This is the ONLY place the API reads phone numbers from, so a
-- donor's number is never exposed to someone who has not claimed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_claim_contacts AS
SELECT  c.claim_id, c.listing_id, c.pickup_code, c.pickup_deadline,
        l.title, l.quantity_servings, l.food_type, l.pickup_address, l.lat, l.lng,
        d.user_id  AS donor_id,
        COALESCE(d.org_name, d.full_name) AS donor_name,
        d.phone    AS donor_phone,
        cl.user_id AS claimant_id,
        COALESCE(cl.org_name, cl.full_name) AS claimant_name,
        cl.full_name AS claimant_person,
        cl.phone   AS claimant_phone
FROM    claims c
JOIN    food_listings l ON l.listing_id = c.listing_id
JOIN    users d  ON d.user_id  = l.donor_id
JOIN    users cl ON cl.user_id = c.claimant_id
WHERE   c.status = 'active';

-- ---------------------------------------------------------------------
-- Monthly impact with running totals (window function SUM OVER).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_monthly_impact AS
WITH monthly AS (
    SELECT  DATE_FORMAT(c.picked_up_at, '%Y-%m') AS month,
            COUNT(*)                    AS pickups,
            SUM(l.quantity_servings)    AS meals_rescued,
            COUNT(DISTINCT l.donor_id)  AS active_donors,
            COUNT(DISTINCT c.claimant_id) AS active_claimers
    FROM    claims c
    JOIN    food_listings l ON l.listing_id = c.listing_id
    WHERE   c.status = 'completed'
    GROUP BY DATE_FORMAT(c.picked_up_at, '%Y-%m')
)
SELECT  month, pickups, meals_rescued, active_donors, active_claimers,
        SUM(meals_rescued) OVER (ORDER BY month ROWS UNBOUNDED PRECEDING) AS meals_running_total,
        meals_rescued - LAG(meals_rescued) OVER (ORDER BY month)          AS change_vs_last_month
FROM    monthly;

-- ---------------------------------------------------------------------
-- Daily rescues for the last 30 days, including days with zero.
-- A recursive CTE generates the calendar, then LEFT JOINs the data.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_daily_rescues_30d AS
WITH RECURSIVE days AS (
    SELECT CURDATE() - INTERVAL 29 DAY AS day
    UNION ALL
    SELECT day + INTERVAL 1 DAY FROM days WHERE day < CURDATE()
),
done AS (
    SELECT DATE(c.picked_up_at) AS day, SUM(l.quantity_servings) AS meals
    FROM   claims c JOIN food_listings l ON l.listing_id = c.listing_id
    WHERE  c.status = 'completed' AND c.picked_up_at >= CURDATE() - INTERVAL 29 DAY
    GROUP BY DATE(c.picked_up_at)
)
SELECT d.day, COALESCE(done.meals, 0) AS meals
FROM   days d LEFT JOIN done ON done.day = d.day;

-- ---------------------------------------------------------------------
-- Donor leaderboard (RANK and share of total).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_top_donors AS
SELECT  u.user_id AS donor_id,
        COALESCE(u.org_name, u.full_name) AS donor_name,
        COUNT(l.listing_id)                       AS listings_posted,
        SUM(l.status = 'picked_up')               AS listings_rescued,
        COALESCE(SUM(CASE WHEN l.status = 'picked_up' THEN l.quantity_servings END), 0) AS meals_rescued,
        RANK() OVER (ORDER BY COALESCE(SUM(CASE WHEN l.status = 'picked_up' THEN l.quantity_servings END), 0) DESC) AS donor_rank,
        ROUND(100 * COALESCE(SUM(CASE WHEN l.status = 'picked_up' THEN l.quantity_servings END), 0)
              / NULLIF(SUM(SUM(CASE WHEN l.status = 'picked_up' THEN l.quantity_servings END)) OVER (), 0), 1) AS share_pct
FROM    users u
JOIN    food_listings l ON l.donor_id = u.user_id
WHERE   u.role = 'donor'
GROUP BY u.user_id, donor_name;

-- ---------------------------------------------------------------------
-- How reliable each NGO / volunteer is at turning up.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_claimer_reliability AS
SELECT  u.user_id AS claimant_id,
        COALESCE(u.org_name, u.full_name) AS claimant_name,
        u.role,
        COUNT(c.claim_id)                         AS total_claims,
        SUM(c.status = 'completed')               AS completed,
        SUM(c.status = 'released')                AS missed,
        ROUND(100 * SUM(c.status = 'released') / NULLIF(COUNT(c.claim_id), 0), 1) AS no_show_pct,
        ROUND(AVG(CASE WHEN c.status = 'completed'
                       THEN TIMESTAMPDIFF(MINUTE, c.claimed_at, c.picked_up_at) END), 0) AS avg_minutes_to_pickup,
        DENSE_RANK() OVER (ORDER BY SUM(c.status = 'completed') DESC) AS pickup_rank
FROM    users u
LEFT JOIN claims c ON c.claimant_id = u.user_id
WHERE   u.role IN ('ngo','volunteer')
GROUP BY u.user_id, claimant_name, u.role;

-- ---------------------------------------------------------------------
-- End-to-end speed: listing posted -> food collected.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_rescue_speed AS
SELECT  l.listing_id, l.title, l.quantity_servings,
        COALESCE(d.org_name, d.full_name) AS donor_name,
        COALESCE(cl.org_name, cl.full_name) AS claimant_name,
        TIMESTAMPDIFF(MINUTE, l.created_at, c.claimed_at)   AS minutes_to_claim,
        TIMESTAMPDIFF(MINUTE, c.claimed_at, c.picked_up_at) AS minutes_to_pickup,
        TIMESTAMPDIFF(MINUTE, l.created_at, c.picked_up_at) AS minutes_total,
        NTILE(4) OVER (ORDER BY TIMESTAMPDIFF(MINUTE, l.created_at, c.picked_up_at)) AS speed_quartile
FROM    claims c
JOIN    food_listings l ON l.listing_id = c.listing_id
JOIN    users d  ON d.user_id  = l.donor_id
JOIN    users cl ON cl.user_id = c.claimant_id
WHERE   c.status = 'completed';

-- ---------------------------------------------------------------------
-- One-row summary for the admin dashboard and the landing page.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_platform_summary AS
SELECT
    (SELECT COALESCE(SUM(l.quantity_servings), 0)
       FROM food_listings l WHERE l.status = 'picked_up')                  AS meals_rescued,
    (SELECT COUNT(*) FROM food_listings WHERE status = 'picked_up')        AS rescues,
    (SELECT COUNT(*) FROM v_available_listings)                            AS available_now,
    (SELECT COALESCE(SUM(quantity_servings), 0) FROM v_available_listings) AS meals_available_now,
    (SELECT COUNT(*) FROM users WHERE role = 'donor')                      AS donors,
    (SELECT COUNT(*) FROM users WHERE role IN ('ngo','volunteer')
                                  AND verification_status = 'verified')   AS verified_claimers,
    (SELECT COUNT(*) FROM verification_requests WHERE status = 'pending') AS pending_verifications,
    (SELECT COUNT(*) FROM food_listings WHERE status = 'expired')          AS expired_listings;
