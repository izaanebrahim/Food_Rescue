-- =====================================================================
-- Food Rescue — 06_seed.sql
-- Demo data around Kattankulathur / Potheri / Guduvanchery.
-- All names are fictional. Every account's password is: password123
-- Times are relative to NOW() so the demo always looks live.
-- =====================================================================
USE food_rescue;

-- Lets seed rows bypass "must be in the future" style trigger checks.
SET @fr_seeding = 1;
SET @pw = '$2b$10$PVCgw5oiupuJjncvc2CEguqdCniIeNwwjTel9XbwZOM3kK3iDEbD2';

INSERT INTO users (user_id, full_name, email, phone, password_hash, role, org_name, address, lat, lng, verification_status, created_at) VALUES
 (1,  'Platform Admin',     'admin@foodrescue.local',     '919000000001', @pw, 'admin',     NULL,                      'SRM IST, Kattankulathur',          12.823100, 80.044400, 'verified',   NOW() - INTERVAL 150 DAY),
 (2,  'Meena Rajan',        'mess@foodrescue.local',      '919000000002', @pw, 'donor',     'Potheri Mess Hall',       '14 GST Road, Potheri',             12.826800, 80.040700, 'verified',   NOW() - INTERVAL 140 DAY),
 (3,  'Senthil Kumar',      'caterers@foodrescue.local',  '919000000003', @pw, 'donor',     'Sri Lakshmi Caterers',    '7 Station Road, Guduvanchery',     12.845200, 80.060000, 'verified',   NOW() - INTERVAL 132 DAY),
 (4,  'Ayesha Banu',        'greenleaf@foodrescue.local', '919000000004', @pw, 'donor',     'Green Leaf Kitchen',      '22 Main Road, Kattankulathur',     12.818000, 80.049000, 'verified',   NOW() - INTERVAL 120 DAY),
 (5,  'Joseph Daniel',      'bakehouse@foodrescue.local', '919000000005', @pw, 'donor',     'Maraimalai Bakehouse',    '3 Industrial Estate, Maraimalai Nagar', 12.792700, 80.023700, 'verified', NOW() - INTERVAL 100 DAY),
 (6,  'Revathi Mohan',      'thendral@foodrescue.local',  '919000000006', @pw, 'donor',     'Thendral Mahal',          '41 Vandalur Road, Urapakkam',      12.867000, 80.070000, 'verified',   NOW() - INTERVAL 90 DAY),
 (7,  'Karthik Subramani',  'annam@foodrescue.local',     '919000000007', @pw, 'ngo',       'Annam Trust',             '9 Temple Street, Guduvanchery',    12.842000, 80.055000, 'verified',   NOW() - INTERVAL 138 DAY),
 (8,  'Fathima Zahra',      'kaikoduppom@foodrescue.local','919000000008', @pw, 'ngo',      'Kaikoduppom Foundation',  '18 Lake View Road, Potheri',       12.829000, 80.037000, 'verified',   NOW() - INTERVAL 125 DAY),
 (9,  'Bala Krishnan',      'littlesteps@foodrescue.local','919000000009', @pw, 'ngo',      'Little Steps Home',       '5 School Lane, Maraimalai Nagar',  12.796000, 80.030000, 'verified',   NOW() - INTERVAL 95 DAY),
 (10, 'Arjun Ramesh',       'arjun@foodrescue.local',     '919000000010', @pw, 'volunteer', NULL,                      'Estancia, Potheri',                12.824000, 80.042000, 'verified',   NOW() - INTERVAL 80 DAY),
 (11, 'Divya Shankar',      'divya@foodrescue.local',     '919000000011', @pw, 'volunteer', NULL,                      'Abode Valley, Potheri',            12.827500, 80.046000, 'unverified', NOW() - INTERVAL 2 DAY),
 (12, 'Hope Shelter',       'hope@foodrescue.local',      '919000000012', @pw, 'ngo',       'Hope Shelter Chengalpattu','2 Hospital Road, Chengalpattu',   12.692100, 79.976200, 'unverified', NOW() - INTERVAL 1 DAY);

-- Verification history: approved requests for verified claimers,
-- pending ones for Divya and Hope Shelter (the admin demo queue).
INSERT INTO verification_requests (user_id, document_type, document_ref, status, submitted_at, reviewed_by, reviewed_at) VALUES
 (7,  'ngo_darpan',       'TN/2019/0234567', 'approved', NOW() - INTERVAL 137 DAY, 1, NOW() - INTERVAL 136 DAY),
 (8,  'ngo_registration', 'REG-CGL-4471',    'approved', NOW() - INTERVAL 124 DAY, 1, NOW() - INTERVAL 123 DAY),
 (9,  'ngo_darpan',       'TN/2021/0981123', 'approved', NOW() - INTERVAL 94 DAY,  1, NOW() - INTERVAL 93 DAY),
 (10, 'college_id',       'CID-2023-10188', 'approved', NOW() - INTERVAL 79 DAY,  1, NOW() - INTERVAL 79 DAY);
INSERT INTO verification_requests (user_id, document_type, document_ref, submitted_at) VALUES
 (11, 'college_id',       'CID-2024-11907', NOW() - INTERVAL 20 HOUR),
 (12, 'ngo_registration', 'REG-CGL-5120',    NOW() - INTERVAL 3 HOUR);

-- ---------------------------------------------------------------------
-- 120 days of history, generated with a recursive CTE.
-- Deterministic pseudo-random values come from MOD() on the row number.
-- ---------------------------------------------------------------------
INSERT INTO food_listings
    (donor_id, title, food_type, category, quantity_servings, prepared_at, expires_at,
     pickup_address, lat, lng, status, created_at, updated_at)
WITH RECURSIVE n AS (
    SELECT 1 AS i UNION ALL SELECT i + 1 FROM n WHERE i < 170
),
gen AS (
    SELECT i,
           2 + MOD(i * 7, 5)                                   AS donor_id,
           NOW() - INTERVAL (120 - FLOOR(i * 120 / 170)) DAY
                 - INTERVAL MOD(i * 37, 9) HOUR                AS made
    FROM n
)
SELECT g.donor_id,
       ELT(1 + MOD(g.i * 11, 10),
           'Vegetable biryani', 'Sambar rice and poriyal', 'Chapati and dal', 'Curd rice',
           'Chicken biryani', 'Idli and chutney', 'Assorted buns and bread', 'Lemon rice',
           'Wedding lunch leftovers', 'Veg pulao'),
       IF(MOD(g.i * 11, 10) = 4, 'non_veg', 'veg'),
       IF(MOD(g.i * 11, 10) = 6, 'bakery', 'cooked'),
       10 + MOD(g.i * 13, 9) * 8 + IF(g.donor_id = 6, 60, 0),
       g.made,
       g.made + INTERVAL (4 + MOD(g.i, 4)) HOUR,
       u.address, u.lat, u.lng,
       IF(MOD(g.i, 9) = 0, 'expired', 'picked_up'),
       g.made + INTERVAL 10 MINUTE,
       g.made + INTERVAL 2 HOUR
FROM gen g JOIN users u ON u.user_id = g.donor_id;

-- Claims for the history: most collected, some missed (released) first.
INSERT INTO claims (listing_id, claimant_id, status, pickup_code, pickup_deadline, claimed_at, picked_up_at, closed_at)
SELECT l.listing_id,
       ELT(1 + MOD(l.listing_id * 7, 10), 7, 7, 7, 7, 8, 8, 8, 9, 9, 10),
       'completed',
       LPAD(MOD(l.listing_id * 7919, 10000), 4, '0'),
       l.created_at + INTERVAL (20 + MOD(l.listing_id * 5, 30)) MINUTE + INTERVAL 45 MINUTE,
       l.created_at + INTERVAL (5 + MOD(l.listing_id * 5, 30)) MINUTE,
       l.created_at + INTERVAL (25 + MOD(l.listing_id * 17, 50)) MINUTE,
       l.created_at + INTERVAL (25 + MOD(l.listing_id * 17, 50)) MINUTE
FROM food_listings l WHERE l.status = 'picked_up';

INSERT INTO claims (listing_id, claimant_id, status, pickup_code, pickup_deadline, claimed_at, closed_at)
SELECT l.listing_id, ELT(1 + MOD(FLOOR(l.listing_id / 9), 3), 9, 10, 8), 'released', '0000',
       l.created_at + INTERVAL 50 MINUTE, l.created_at + INTERVAL 5 MINUTE, l.created_at + INTERVAL 50 MINUTE
FROM food_listings l WHERE l.status = 'expired';

INSERT INTO feedback (claim_id, rating, comment, created_at)
SELECT c.claim_id, 3 + MOD(c.claim_id, 3),
       ELT(1 + MOD(c.claim_id, 4), 'Packed well, still warm.', 'On time and easy to find.',
           'Fed the evening batch at the home.', NULL),
       c.picked_up_at + INTERVAL 1 HOUR
FROM claims c WHERE c.status = 'completed' AND MOD(c.claim_id, 3) = 0;

-- ---------------------------------------------------------------------
-- Live listings for the demo (available right now).
-- ---------------------------------------------------------------------
INSERT INTO food_listings
    (donor_id, title, description, food_type, category, quantity_servings, prepared_at, expires_at,
     pickup_address, lat, lng, pickup_notes, status, created_at) VALUES
 (2, 'Sambar rice and cabbage poriyal', 'Lunch surplus from the hostel mess, kept in steel vessels.',
     'veg', 'cooked', 45, NOW() - INTERVAL 50 MINUTE, NOW() + INTERVAL 4 HOUR,
     '14 GST Road, Potheri', 12.826800, 80.040700, 'Back gate near the store room. Bring containers.', 'available', NOW() - INTERVAL 25 MINUTE),
 (3, 'Wedding lunch: veg meals', 'Rice, sambar, rasam, two poriyals and payasam. Packed in foil trays.',
     'veg', 'cooked', 120, NOW() - INTERVAL 70 MINUTE, NOW() + INTERVAL 5 HOUR,
     '7 Station Road, Guduvanchery', 12.845200, 80.060000, 'Ask for Senthil at the kitchen entrance.', 'available', NOW() - INTERVAL 40 MINUTE),
 (4, 'Chicken biryani with raita', 'Extra from a cancelled office order. Sealed boxes.',
     'non_veg', 'cooked', 30, NOW() - INTERVAL 30 MINUTE, NOW() + INTERVAL 3 HOUR,
     '22 Main Road, Kattankulathur', 12.818000, 80.049000, NULL, 'available', NOW() - INTERVAL 15 MINUTE),
 (5, 'Day-old bread and buns', 'Sweet buns, milk bread and rusk. Fine for two days.',
     'veg', 'bakery', 60, NOW() - INTERVAL 10 HOUR, NOW() + INTERVAL 30 HOUR,
     '3 Industrial Estate, Maraimalai Nagar', 12.792700, 80.023700, 'Open till 9 pm.', 'available', NOW() - INTERVAL 2 HOUR),
 (6, 'Reception dinner: chapati and kurma', 'Chapati, veg kurma, curd rice. Around 80 plates.',
     'veg', 'cooked', 80, NOW() - INTERVAL 40 MINUTE, NOW() + INTERVAL 80 MINUTE,
     '41 Vandalur Road, Urapakkam', 12.867000, 80.070000, 'Hall manager will hand over at the side entrance.', 'available', NOW() - INTERVAL 10 MINUTE),
 (4, 'Vegan lemon rice', 'No ghee or curd. Packed in 25 parcels.',
     'vegan', 'cooked', 25, NOW() - INTERVAL 20 MINUTE, NOW() + INTERVAL 150 MINUTE,
     '22 Main Road, Kattankulathur', 12.818000, 80.049000, NULL, 'available', NOW() - INTERVAL 5 MINUTE),
 (2, 'Idli and coconut chutney', 'Breakfast surplus.',
     'veg', 'cooked', 40, NOW() - INTERVAL 90 MINUTE, NOW() + INTERVAL 2 HOUR,
     '14 GST Road, Potheri', 12.826800, 80.040700, NULL, 'available', NOW() - INTERVAL 60 MINUTE);

-- Annam Trust has claimed the idli listing (code 4821) for the pickup demo.
UPDATE food_listings SET status = 'claimed' WHERE title = 'Idli and coconut chutney' AND status = 'available';
INSERT INTO claims (listing_id, claimant_id, status, pickup_code, pickup_deadline, claimed_at)
SELECT listing_id, 7, 'active', '4821', NOW() + INTERVAL 35 MINUTE, NOW() - INTERVAL 10 MINUTE
FROM food_listings WHERE title = 'Idli and coconut chutney' AND status = 'claimed';

INSERT INTO notifications (user_id, listing_id, type, message, wa_status, created_at)
SELECT 2, listing_id, 'listing_claimed',
       'Annam Trust claimed "Idli and coconut chutney". Ask for pickup code 4821.', 'skipped', NOW() - INTERVAL 10 MINUTE
FROM food_listings WHERE title = 'Idli and coconut chutney';

-- Old seed notifications should not be sent on WhatsApp.
UPDATE notifications SET wa_status = 'skipped';

SET @fr_seeding = NULL;
