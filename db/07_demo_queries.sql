-- =====================================================================
-- Food Rescue — 07_demo_queries.sql
-- Queries to run during the review / viva in MySQL Workbench.
-- Not run by setup-db.js. Run 01–06 first.
-- =====================================================================
USE food_rescue;

-- 1. What is waiting near SRM right now? (stored procedure + function)
CALL sp_nearby_listings(12.823100, 80.044400, 10, NULL);

-- 2. Distance between two points with the stored function.
SELECT fn_distance_km(12.8231, 80.0444, 12.8452, 80.0600) AS srm_to_guduvanchery_km;

-- 3. Why a user cannot claim (stored function used by the trigger).
SELECT full_name, role, verification_status, fn_claim_block_reason(user_id) AS can_claim
FROM users ORDER BY user_id;

-- 4. Claim inside a transaction. Run twice: the second call fails with
--    "Someone else has already claimed this food".
SET @lid = (SELECT listing_id FROM v_available_listings ORDER BY minutes_left DESC LIMIT 1);
CALL sp_claim_listing(@lid, 8, 45, @claim, @code, @deadline);
SELECT @claim AS claim_id, @code AS pickup_code, @deadline AS collect_by;
-- CALL sp_claim_listing(@lid, 9, 45, @c2, @k2, @d2);   -- fails

-- 5. Wrong code, then right code.
-- CALL sp_confirm_pickup(@lid, (SELECT donor_id FROM food_listings WHERE listing_id = @lid), '0000');
CALL sp_confirm_pickup(@lid, (SELECT donor_id FROM food_listings WHERE listing_id = @lid), @code);

-- 6. The audit trail the triggers wrote.
SELECT * FROM status_log WHERE listing_id = @lid ORDER BY changed_at;
SELECT user_id, type, message FROM notifications WHERE listing_id = @lid;

-- 7. Only one ACTIVE claim per listing: the generated column + UNIQUE index.
SHOW CREATE TABLE claims;

-- 8. Missed pickup: move a deadline into the past and run the job by hand.
--    The listing goes back to 'available' and the claimer's no_show_count rises.
SET @demo = (SELECT claim_id FROM claims WHERE status = 'active' LIMIT 1);
UPDATE claims SET claimed_at = NOW() - INTERVAL 60 MINUTE,
                  pickup_deadline = NOW() - INTERVAL 1 MINUTE WHERE claim_id = @demo;
CALL sp_release_missed_pickups();
SELECT c.status, l.status AS listing_status, u.no_show_count
FROM claims c JOIN food_listings l USING (listing_id) JOIN users u ON u.user_id = c.claimant_id
WHERE c.claim_id = @demo;

-- 9. Reports (views with window functions and CTEs).
SELECT * FROM v_monthly_impact;            -- SUM() OVER, LAG()
SELECT * FROM v_top_donors;                -- RANK(), share of total via SUM(SUM()) OVER ()
SELECT * FROM v_claimer_reliability;       -- DENSE_RANK()
SELECT * FROM v_daily_rescues_30d;         -- recursive CTE calendar
SELECT speed_quartile, COUNT(*) AS pickups, ROUND(AVG(minutes_total)) AS avg_minutes
FROM v_rescue_speed GROUP BY speed_quartile;   -- NTILE(4)

-- 10. Busiest hour of the day for listings (GROUP BY on an expression).
SELECT HOUR(created_at) AS hour_of_day, COUNT(*) AS listings, SUM(quantity_servings) AS servings
FROM food_listings GROUP BY HOUR(created_at) ORDER BY servings DESC LIMIT 5;

-- 11. Each donor's best month (CTE + ROW_NUMBER).
WITH m AS (
    SELECT l.donor_id, DATE_FORMAT(c.picked_up_at, '%Y-%m') AS month, SUM(l.quantity_servings) AS servings
    FROM claims c JOIN food_listings l ON l.listing_id = c.listing_id
    WHERE c.status = 'completed'
    GROUP BY l.donor_id, month
)
SELECT u.org_name, m.month, m.servings
FROM (SELECT m.*, ROW_NUMBER() OVER (PARTITION BY donor_id ORDER BY servings DESC) AS rn FROM m) m
JOIN users u ON u.user_id = m.donor_id
WHERE m.rn = 1;

-- 12. Index use: the bounding-box search hits idx_listings_geo.
EXPLAIN SELECT listing_id FROM food_listings
WHERE lat BETWEEN 12.73 AND 12.91 AND lng BETWEEN 79.95 AND 80.14;

-- 13. Scheduled jobs.
SHOW EVENTS;
SELECT @@event_scheduler;

-- 14. Everything the database contains.
SELECT ROUTINE_TYPE, ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = 'food_rescue';
SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING
FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'food_rescue';
SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'food_rescue';
