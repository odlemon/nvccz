-- Database-level guard for audit_logs (SRD 33): UPDATE and DELETE are refused. Run once by a DBA (needs SUPER, or
-- log_bin_trust_function_creators=1 when binary logging is on). The application already refuses these writes itself
-- (src/utils/auditImmutability.ts); this makes raw SQL refuse them too. Maintenance: SET @audit_maintenance = 1 on your own connection.
DROP TRIGGER IF EXISTS audit_logs_no_update;
DROP TRIGGER IF EXISTS audit_logs_no_delete;
DELIMITER $$
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW
    BEGIN
      IF COALESCE(@audit_maintenance, 0) <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit history is immutable: entries cannot be deleted';
      END IF;
    END$$
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW
    BEGIN
      IF COALESCE(@audit_maintenance, 0) <> 1 AND (
           NOT (NEW.action <=> OLD.action) OR NOT (NEW.entityType <=> OLD.entityType) OR NOT (NEW.entityId <=> OLD.entityId)
        OR NOT (NEW.ipAddress <=> OLD.ipAddress) OR NOT (NEW.userAgent <=> OLD.userAgent) OR NOT (NEW.createdAt <=> OLD.createdAt)
        OR CAST(NEW.oldValues AS CHAR) <=> CAST(OLD.oldValues AS CHAR) IS FALSE OR CAST(NEW.newValues AS CHAR) <=> CAST(OLD.newValues AS CHAR) IS FALSE
        OR (NOT (NEW.event_type <=> OLD.event_type) AND OLD.event_type IS NOT NULL)
        OR (NOT (NEW.userId <=> OLD.userId) AND NEW.userId IS NOT NULL)
      ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit history is immutable: entries cannot be modified';
      END IF;
    END$$
DELIMITER ;
