-- 017-maintenance-triggers.sql
-- Triggers to auto-update airframe hours and component times from flight logs.

CREATE OR REPLACE FUNCTION update_airframe_hours_from_log()
RETURNS TRIGGER AS $$
DECLARE
    tach_diff NUMERIC(7,1);
    str_hours INT;
    str_mins INT;
    new_total_str VARCHAR(20);
BEGIN
    IF NEW.tach_start IS NOT NULL AND NEW.tach_end IS NOT NULL THEN
        tach_diff := NEW.tach_end - NEW.tach_start;
        IF tach_diff > 0 THEN
            UPDATE airframe_hours
            SET total_hours = TO_CHAR(
                    GREATEST(0, SPLIT_PART(total_hours, ':', 1)::int + FLOOR(tach_diff)::int),
                    'FM999999'
                ) || ':' || LPAD(
                    (
                        SPLIT_PART(total_hours, ':', 2)::int + ROUND((tach_diff - FLOOR(tach_diff)) * 60)
                    )::int % 60
                )::text,
                2, '0'
            ),
            last_reading_date = NEW.departure_date,
            updated_at = NOW()
            WHERE aircraft_id = NEW.aircraft_id;

            -- Also update lifed_components with new current_hours
            UPDATE lifed_components
            SET current_hours = current_hours + tach_diff,
                current_cycles = current_cycles + NEW.cycles,
                hours_remaining = tbo_hours - (current_hours + tach_diff - installed_hours),
                cycles_remaining = tbo_cycles - (current_cycles + NEW.cycles - installed_cycles),
                last_inspected_at = NOW()
            WHERE aircraft_id = NEW.aircraft_id AND status = 'active';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_flight_log_update_hours ON flight_logs;
CREATE TRIGGER trg_flight_log_update_hours
AFTER INSERT ON flight_logs
FOR EACH ROW EXECUTE FUNCTION update_airframe_hours_from_log();
