# Advanced SQL features used

This is the list to walk through in the review. Every item points at the file and object where it is used, and `db/07_demo_queries.sql` has a query that shows it working.

| # | Feature | Where | Purpose |
|---|---|---|---|
| 1 | Transactions with row locks (`START TRANSACTION`, `SELECT ... FOR UPDATE`, `COMMIT`/`ROLLBACK`) | `sp_claim_listing`, `sp_confirm_pickup`, `sp_cancel_claim`, `sp_cancel_listing`, `sp_review_verification` | Only one of several simultaneous claims can win |
| 2 | Error handling in procedures (`DECLARE EXIT HANDLER FOR SQLEXCEPTION`, `RESIGNAL`) | all write procedures | Any error rolls the whole change back, then reports the original error |
| 3 | Custom errors (`SIGNAL SQLSTATE '45000'`) | triggers and procedures | Readable rule violations that the API shows to the user as-is |
| 4 | Stored procedures with `IN`/`OUT` parameters | `sp_claim_listing` returns claim id, pickup code, deadline | One call does the whole claim |
| 5 | Stored functions | `fn_distance_km` (DETERMINISTIC), `fn_claim_block_reason` (READS SQL DATA) | Reused by views, procedures and triggers |
| 6 | Cursors and loops | `sp_release_missed_pickups` (`DECLARE CURSOR`, `FETCH`, `LOOP`, `CONTINUE HANDLER FOR NOT FOUND`) | Releases each missed pickup in its own small transaction |
| 7 | BEFORE triggers that validate | `trg_users_bi`, `trg_listings_bi`, `trg_listings_bu`, `trg_claims_bi`, `trg_feedback_bi` | Food safety, verification gate, legal status transitions |
| 8 | AFTER triggers that write other tables | `trg_listings_ai`, `trg_listings_au`, `trg_claims_ai`, `trg_claims_au`, `trg_vr_ai` | Audit log, notifications, no-show counting, suspension |
| 9 | Scheduled events | `ev_release_missed_pickups` (1 min), `ev_expire_listings` (5 min), `ev_purge_old_notifications` (1 day) | Time-based rules run without the app |
| 10 | CHECK constraints (MySQL 8.0.16+) | 16 across the tables, including `REGEXP` and cross-column checks | Data is valid at the lowest level |
| 11 | Generated column + UNIQUE index | `claims.active_listing_id` | "At most one active claim per listing" as a constraint (a partial unique index, which MySQL does not have directly) |
| 12 | Window functions | `RANK`, `DENSE_RANK`, `NTILE`, `LAG`, `SUM() OVER`, `SUM(SUM()) OVER ()` in the views; `ROW_NUMBER` in the demo queries | Rankings, running totals, month-on-month change, quartiles |
| 13 | Common table expressions | `v_monthly_impact`, `v_daily_rescues_30d` | Readable multi-step reports |
| 14 | Recursive CTE | `v_daily_rescues_30d` (calendar of 30 days), `06_seed.sql` (generates 170 historical listings) | Days with zero rescues still appear; bulk demo data without a script |
| 15 | Views as a security boundary | `v_claim_contacts` | Phone numbers are reachable only for active claims |
| 16 | Spatial function | `ST_Distance_Sphere(POINT(lng, lat), ...)` in `fn_distance_km` | Real distances in km |
| 17 | Index-friendly search | Bounding box on `idx_listings_geo`, then exact distance (`sp_nearby_listings`) | Filters by index before the expensive calculation |
| 18 | Composite indexes | `(status, expires_at)`, `(status, pickup_deadline)`, `(claimant_id, status)`, `(user_id, read_at, created_at)` | Match the WHERE and ORDER BY of the busiest queries |
| 19 | Correlated subqueries | `/listings/mine` (latest claim per listing), `v_platform_summary`, admin queue (`previous_rejections`) | |
| 20 | Multi-table UPDATE with JOIN | `sp_expire_listings` | Close claims on expired food in one statement |
| 21 | `INSERT ... SELECT` | reminders in `sp_release_missed_pickups`; seed data | Set-based inserts |
| 22 | ENUMs, `ON UPDATE CURRENT_TIMESTAMP`, `DATETIME(3)` | schema | Fixed vocabularies, automatic timestamps, millisecond ordering of the audit log |
| 23 | Referential actions | RESTRICT / CASCADE / SET NULL chosen per FK | See DATABASE.md |
| 24 | Session variables | `@fr_seeding` in triggers | Lets the seed load past-dated rows that the triggers would normally reject |

---

## Transactions and concurrency

`sp_claim_listing` (in `04_procedures.sql`):

```sql
START TRANSACTION;
    SELECT status, expires_at INTO v_status, v_expires
      FROM food_listings WHERE listing_id = p_listing_id
       FOR UPDATE;                       -- exclusive row lock

    IF v_status <> 'available' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Someone else has already claimed this food';
    END IF;

    UPDATE food_listings SET status = 'claimed' WHERE listing_id = p_listing_id;
    INSERT INTO claims (...) VALUES (...);
COMMIT;
```

**Why `FOR UPDATE`?** Without it, two sessions could both read `available` and both insert a claim (a lost update). With it, the second session waits at the `SELECT` until the first commits, then reads the new status `claimed` and stops.

**Why InnoDB's default `REPEATABLE READ` is fine here:** a locking read (`FOR UPDATE`) always reads the latest committed row, not the transaction's snapshot.

**Second line of defence:** the generated column and unique index.

```sql
active_listing_id INT UNSIGNED AS (IF(status = 'active', listing_id, NULL)) STORED,
CONSTRAINT uq_claims_one_active UNIQUE (active_listing_id)
```

Completed and released claims get NULL, and a UNIQUE index allows many NULLs, so a listing can have any number of old claims but only one active one.

`npm test` fires four claims at the same instant and checks that exactly one wins.

## Triggers

| Trigger | Timing | Does |
|---|---|---|
| trg_users_bi | BEFORE INSERT users | Lower-cases email; donors/admins start verified; nobody can sign up already verified |
| trg_listings_bi | BEFORE INSERT food_listings | Only donors; at least 60 min of safe time left; cooked food ≤ 12 h after preparation |
| trg_listings_ai | AFTER INSERT food_listings | First `status_log` row |
| trg_listings_bu | BEFORE UPDATE food_listings | Allows only legal status transitions |
| trg_listings_au | AFTER UPDATE food_listings | `status_log` row; "expired" and "collected" notifications |
| trg_claims_bi | BEFORE INSERT claims | Verified, non-suspended NGO/volunteer only; food not expired |
| trg_claims_ai | AFTER INSERT claims | Notifies the donor and the claimer, with the pickup code |
| trg_claims_au | AFTER UPDATE claims | On a missed pickup: +1 no-show, notification, 24-hour pause after 3 |
| trg_vr_ai | AFTER INSERT verification_requests | Moves the user to `pending` |
| trg_feedback_bi | BEFORE INSERT feedback | Only after a completed pickup |

## Views

| View | Technique |
|---|---|
| v_available_listings | Join + `TIMESTAMPDIFF` for minutes left |
| v_claim_contacts | Two joins to `users` (donor and claimer); filters active claims only |
| v_monthly_impact | CTE, `SUM() OVER (ORDER BY month ROWS UNBOUNDED PRECEDING)`, `LAG()` |
| v_daily_rescues_30d | `WITH RECURSIVE` calendar + `LEFT JOIN` |
| v_top_donors | `RANK()`; share of total with `SUM(SUM(...)) OVER ()` |
| v_claimer_reliability | Conditional aggregation `SUM(status = 'completed')`, `DENSE_RANK()` |
| v_rescue_speed | `NTILE(4)` speed quartiles |
| v_platform_summary | Scalar subqueries for the dashboard totals |

## Possible viva questions

**Why not do this in the backend?** Rules in the database hold for every client: the web app, Workbench, a future mobile app, or a buggy API. They also run inside the same transaction as the data change.

**What isolation level do you use?** InnoDB's default, REPEATABLE READ. Correctness comes from the locking read `SELECT ... FOR UPDATE`, which always sees the latest committed version and holds an exclusive lock until COMMIT.

**What if `event_scheduler` is OFF?** The Node scheduler calls the same procedures every minute. They are idempotent, so running them twice is harmless.

**Why a generated column instead of a partial index?** MySQL has no partial (filtered) unique index. A stored generated column that is NULL for non-active rows gives the same effect, because UNIQUE ignores NULLs.

**Why `ST_Distance_Sphere` and a bounding box?** The function is accurate but cannot use an index. Filtering on `lat BETWEEN ... AND lng BETWEEN ...` first lets MySQL use `idx_listings_geo` (see the `EXPLAIN` in the demo queries), and the exact distance then runs on a handful of rows.

**How are pickup codes generated?** `LPAD(FLOOR(RAND() * 10000), 4, '0')`. They only need to be hard to guess for someone standing at the counter, and they are checked together with the listing, so a code is useless for any other listing.
