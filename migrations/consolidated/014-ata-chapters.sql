-- 016-ata-chapters.sql
-- ATA chapter reference data for BN-2B Islander maintenance categorization.

CREATE TABLE IF NOT EXISTS ata_chapters (
    chapter         VARCHAR(10) PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    aircraft_type   VARCHAR(100) DEFAULT 'BN-2B Islander'
);

INSERT INTO ata_chapters (chapter, title, description) VALUES
('05','Time Limits/Maintenance Checks','Scheduled inspection intervals and life limits'),
('12','Servicing','Fuel, oil, hydraulic, and pneumatic servicing'),
('27','Flight Controls','Aileron, elevator, rudder, and flap control systems'),
('32','Landing Gear','Main gear, nose gear, wheels, brakes, and tires'),
('61','Propellers','Propeller assembly, governor, and de-ice system'),
('71','Power Plant','Engine cowling, mounts, and fire detection'),
('72','Engine','Lycoming O-540-E4C5 — cylinders, pistons, valves'),
('79','Oil System','Oil tank, cooler, filter, and indicating system')
ON CONFLICT (chapter) DO NOTHING;
