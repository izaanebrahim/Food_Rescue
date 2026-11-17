-- =====================================================================
-- Food Rescue — 05_events.sql
-- Scheduled jobs inside MySQL. Needs the event scheduler on:
--     SET GLOBAL event_scheduler = ON;
-- (It is ON by default in MySQL 8. The backend also runs the same
-- procedures every minute as a fallback, so the app works either way.)
-- =====================================================================
USE food_rescue;

DROP EVENT IF EXISTS ev_release_missed_pickups;
CREATE EVENT ev_release_missed_pickups
    ON SCHEDULE EVERY 1 MINUTE
    COMMENT 'Send reminders and release claims past their pickup deadline'
    DO CALL sp_release_missed_pickups();

DROP EVENT IF EXISTS ev_expire_listings;
CREATE EVENT ev_expire_listings
    ON SCHEDULE EVERY 5 MINUTE
    COMMENT 'Mark food past its safe time as expired'
    DO CALL sp_expire_listings();

DROP EVENT IF EXISTS ev_purge_old_notifications;
CREATE EVENT ev_purge_old_notifications
    ON SCHEDULE EVERY 1 DAY
    COMMENT 'Remove read notifications older than 60 days'
    DO DELETE FROM notifications
        WHERE read_at IS NOT NULL AND created_at < NOW() - INTERVAL 60 DAY;
