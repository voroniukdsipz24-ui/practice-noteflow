-- schema.sql — Налаштування бази даних
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notes (
    id            VARCHAR(32)   NOT NULL,
    edit_token    VARCHAR(64)   NOT NULL,

    title         VARCHAR(500)  NOT NULL DEFAULT '',
    content       LONGTEXT      NOT NULL,

    read_once     TINYINT(1)    NOT NULL DEFAULT 0,
    expire_at     DATETIME      DEFAULT NULL,

    password_hash VARCHAR(255)  NOT NULL DEFAULT '',

    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY idx_edit_token (edit_token),

    INDEX idx_expire  (expire_at),
    INDEX idx_created (created_at)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ── Необов’язково: запланована подія для автоматичного видалення прострочених нотаток ─────────────────
-- Потребує: SET GLOBAL event_scheduler = ON;  (додати в my.cnf для постійного застосування)
--
-- DROP EVENT IF EXISTS cleanup_expired_notes;
-- CREATE EVENT cleanup_expired_notes
--     ON SCHEDULE EVERY 10 MINUTE
--     DO DELETE FROM notes WHERE expire_at IS NOT NULL AND expire_at < NOW();
