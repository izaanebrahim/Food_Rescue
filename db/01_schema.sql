-- =====================================================================
-- Food Rescue — 01_schema.sql
-- Tables, keys, CHECK constraints and indexes.
-- Target: MySQL 8.0+
-- =====================================================================

DROP DATABASE IF EXISTS food_rescue;
CREATE DATABASE food_rescue CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE food_rescue;

-- ---------------------------------------------------------------------
-- users: donors, NGOs, volunteers and admins share one table.
-- verification_status is set by trg_users_bi (donors/admins start
-- verified; NGOs and volunteers must submit documents first).
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name           VARCHAR(100)  NOT NULL,
    email               VARCHAR(150)  NOT NULL,
    phone               VARCHAR(15)   NOT NULL COMMENT 'Country code + number, digits only, e.g. 919876543210',
    password_hash       VARCHAR(100)  NOT NULL,
    role                ENUM('donor','ngo','volunteer','admin') NOT NULL,
    org_name            VARCHAR(150)  NULL     COMMENT 'Restaurant, hostel or NGO name',
    address             VARCHAR(255)  NULL,
    lat                 DECIMAL(9,6)  NULL,
    lng                 DECIMAL(9,6)  NULL,
    verification_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
    no_show_count       TINYINT UNSIGNED NOT NULL DEFAULT 0,
    suspended_until     DATETIME      NULL     COMMENT 'Set after repeated no-shows',
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_phone UNIQUE (phone),
    CONSTRAINT chk_users_phone CHECK (phone REGEXP '^[0-9]{11,15}$'),
    CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%'),
    CONSTRAINT chk_users_lat   CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
    CONSTRAINT chk_users_lng   CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
    CONSTRAINT chk_users_org   CHECK (role <> 'ngo' OR org_name IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- food_listings: one row per batch of surplus food.
-- ---------------------------------------------------------------------
CREATE TABLE food_listings (
    listing_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    donor_id          INT UNSIGNED NOT NULL,
    title             VARCHAR(120) NOT NULL,
    description       VARCHAR(500) NULL,
    food_type         ENUM('veg','non_veg','vegan') NOT NULL,
    category          ENUM('cooked','packaged','bakery','raw','fruits_veg') NOT NULL DEFAULT 'cooked',
    quantity_servings SMALLINT UNSIGNED NOT NULL,
    prepared_at       DATETIME     NOT NULL,
    expires_at        DATETIME     NOT NULL,
    pickup_address    VARCHAR(255) NOT NULL,
    lat               DECIMAL(9,6) NOT NULL,
    lng               DECIMAL(9,6) NOT NULL,
    pickup_notes      VARCHAR(255) NULL,
    status            ENUM('available','claimed','picked_up','expired','cancelled') NOT NULL DEFAULT 'available',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_listings_donor FOREIGN KEY (donor_id) REFERENCES users(user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_listing_qty     CHECK (quantity_servings BETWEEN 1 AND 5000),
    CONSTRAINT chk_listing_window  CHECK (expires_at > prepared_at),
    CONSTRAINT chk_listing_shelf   CHECK (TIMESTAMPDIFF(HOUR, prepared_at, expires_at) <= 72),
    CONSTRAINT chk_listing_lat     CHECK (lat BETWEEN -90 AND 90),
    CONSTRAINT chk_listing_lng     CHECK (lng BETWEEN -180 AND 180),

    INDEX idx_listings_status_expiry (status, expires_at),
    INDEX idx_listings_geo (lat, lng),
    INDEX idx_listings_donor (donor_id, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- claims: an NGO/volunteer reserving a listing and collecting it.
-- A listing can be claimed again after a claim is released, so
-- listing_id alone is not unique. Instead, the generated column
-- active_listing_id is listing_id only while the claim is active, and
-- a UNIQUE index on it guarantees at most ONE active claim per listing
-- (NULLs are allowed to repeat in a UNIQUE index).
-- ---------------------------------------------------------------------
CREATE TABLE claims (
    claim_id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    listing_id        INT UNSIGNED NOT NULL,
    claimant_id       INT UNSIGNED NOT NULL,
    status            ENUM('active','completed','released','cancelled') NOT NULL DEFAULT 'active',
    pickup_code       CHAR(4)      NOT NULL,
    pickup_deadline   DATETIME     NOT NULL,
    claimed_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    picked_up_at      DATETIME     NULL,
    closed_at         DATETIME     NULL,
    reminder_sent     BOOLEAN      NOT NULL DEFAULT FALSE,
    active_listing_id INT UNSIGNED AS (IF(status = 'active', listing_id, NULL)) STORED,

    CONSTRAINT fk_claims_listing  FOREIGN KEY (listing_id)  REFERENCES food_listings(listing_id) ON DELETE RESTRICT, -- CASCADE is not allowed on a base column of a stored generated column
    CONSTRAINT fk_claims_claimant FOREIGN KEY (claimant_id) REFERENCES users(user_id)            ON DELETE RESTRICT,
    CONSTRAINT uq_claims_one_active UNIQUE (active_listing_id),
    CONSTRAINT chk_claims_code     CHECK (pickup_code REGEXP '^[0-9]{4}$'),
    CONSTRAINT chk_claims_deadline CHECK (pickup_deadline > claimed_at),
    CONSTRAINT chk_claims_pickup   CHECK (status <> 'completed' OR picked_up_at IS NOT NULL),

    INDEX idx_claims_claimant (claimant_id, status),
    INDEX idx_claims_deadline (status, pickup_deadline)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- status_log: audit trail, filled only by trg_listings_au.
-- ---------------------------------------------------------------------
CREATE TABLE status_log (
    log_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    listing_id  INT UNSIGNED NOT NULL,
    old_status  VARCHAR(20)  NULL,
    new_status  VARCHAR(20)  NOT NULL,
    changed_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_log_listing FOREIGN KEY (listing_id) REFERENCES food_listings(listing_id) ON DELETE CASCADE,
    INDEX idx_log_listing (listing_id, changed_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- verification_requests: documents NGOs/volunteers submit to an admin.
-- ---------------------------------------------------------------------
CREATE TABLE verification_requests (
    request_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        INT UNSIGNED NOT NULL,
    document_type  ENUM('ngo_registration','ngo_darpan','govt_id','college_id') NOT NULL,
    document_ref   VARCHAR(60)  NOT NULL COMMENT 'Registration / Darpan / ID number',
    document_path  VARCHAR(255) NULL     COMMENT 'Uploaded file, relative to server/uploads',
    status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    remarks        VARCHAR(255) NULL,
    submitted_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by    INT UNSIGNED NULL,
    reviewed_at    DATETIME     NULL,

    CONSTRAINT fk_vr_user     FOREIGN KEY (user_id)     REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_vr_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT chk_vr_review  CHECK ((status = 'pending') = (reviewed_at IS NULL)),
    CONSTRAINT chk_vr_reject  CHECK (status <> 'rejected' OR remarks IS NOT NULL),
    INDEX idx_vr_status (status, submitted_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- notifications: written by triggers/events; the backend shows them
-- in the app and (if configured) sends a WhatsApp copy.
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    listing_id      INT UNSIGNED NULL,
    type            ENUM('listing_claimed','claim_confirmed','pickup_reminder','claim_released',
                         'picked_up','listing_expired','verification_approved','verification_rejected',
                         'account_suspended') NOT NULL,
    message         VARCHAR(300) NOT NULL,
    wa_status       ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         DATETIME     NULL,

    CONSTRAINT fk_notif_user    FOREIGN KEY (user_id)    REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_listing FOREIGN KEY (listing_id) REFERENCES food_listings(listing_id) ON DELETE SET NULL,
    INDEX idx_notif_user (user_id, read_at, created_at),
    INDEX idx_notif_wa (wa_status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- feedback: claimer rates a completed pickup (one per claim).
-- ---------------------------------------------------------------------
CREATE TABLE feedback (
    feedback_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    claim_id    INT UNSIGNED NOT NULL,
    rating      TINYINT UNSIGNED NOT NULL,
    comment     VARCHAR(300) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_feedback_claim FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE,
    CONSTRAINT uq_feedback_claim UNIQUE (claim_id),
    CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;
