-- โครงสร้างรถ 3 แบบ (dev ยืนยัน 2026-09-28):
--   1) รถบริษัท     : คนขับของบริษัท (Drivers.ProviderID = NULL) + รถของบริษัท (Vehicles.ProviderID = NULL)
--   2) รถเช่า       : บริษัทรถเช่า (Providers.Kind = 'Rental') มีคนขับ + รถที่ลงทะเบียนไว้ เลือกคู่ตอนจัดรถ
--   3) เรียกรถออนไลน์ : เช่น Grab (Providers.Kind = 'OnDemand') ไม่มีรายชื่อ - กรอกคนขับ/เบอร์/ทะเบียนรายทริป
-- คนขับและรถของแบบ 1-2 กันจัดซ้อนเวลา (เหมือนคนขับภายในเดิม)

CREATE TABLE Providers (
    ProviderID      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name            NVARCHAR(200)   NOT NULL,
    Kind            VARCHAR(10)     NOT NULL,
    Phone           NVARCHAR(50)    NULL,   -- เบอร์ติดต่อบริษัทรถเช่า (เรียกรถออนไลน์ไม่มี)
    IsActive        BIT             NOT NULL CONSTRAINT DF_Providers_IsActive DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL CONSTRAINT DF_Providers_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL CONSTRAINT DF_Providers_UpdatedAt DEFAULT SYSUTCDATETIME(),
    LegacyDriverID  INT             NULL,   -- ใช้ระหว่างแปลงข้อมูลในไฟล์นี้เท่านั้น ลบทิ้งท้ายไฟล์

    CONSTRAINT CK_Providers_Kind CHECK (Kind IN ('Rental', 'OnDemand'))
);
GO

CREATE TABLE Vehicles (
    VehicleID       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    LicensePlate    NVARCHAR(50)    NOT NULL,
    VehicleType     VARCHAR(10)     NOT NULL,
    SeatCount       INT             NULL,
    Description     NVARCHAR(200)   NULL,   -- ยี่ห้อ/รุ่น/สี ช่วยให้ผู้ขอหารถเจอ
    ProviderID      INT             NULL,   -- NULL = รถของบริษัทเอง
    IsActive        BIT             NOT NULL CONSTRAINT DF_Vehicles_IsActive DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL CONSTRAINT DF_Vehicles_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL CONSTRAINT DF_Vehicles_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_Vehicles_Provider FOREIGN KEY (ProviderID) REFERENCES Providers(ProviderID),
    CONSTRAINT CK_Vehicles_VehicleType CHECK (VehicleType IN ('Van', 'Sedan')),
    CONSTRAINT CK_Vehicles_SeatCount CHECK (SeatCount IS NULL OR SeatCount > 0)
);
GO

-- ทะเบียนซ้ำไม่ได้ในบรรดารถที่ยังใช้งาน (รถที่ปิดใช้งานแล้วเก็บไว้เป็นประวัติ)
CREATE UNIQUE INDEX UX_Vehicles_LicensePlate_Active ON Vehicles (LicensePlate) WHERE IsActive = 1;
GO

ALTER TABLE Drivers ADD ProviderID INT NULL CONSTRAINT FK_Drivers_Provider REFERENCES Providers(ProviderID);
GO

ALTER TABLE VehicleRequests ADD
    ProviderID          INT NULL CONSTRAINT FK_VehicleRequests_Provider REFERENCES Providers(ProviderID),
    AssignedVehicleID   INT NULL CONSTRAINT FK_VehicleRequests_Vehicle REFERENCES Vehicles(VehicleID);
GO

-- แปลงข้อมูลเดิม: "คนขับภายนอก" เดิมถูกใช้แบบกรอกคนขับรายทริปอยู่แล้ว → กลายเป็นผู้ให้บริการแบบเรียกรถออนไลน์
-- (ถ้าจริงๆ เป็นบริษัทรถเช่า Admin เปลี่ยนประเภทได้ในหน้าจัดการ แล้วลงทะเบียนคนขับ/รถเพิ่ม)
ALTER TABLE VehicleRequests DROP CONSTRAINT CK_VehicleRequests_AssignedHasDriver;
GO

INSERT INTO Providers (Name, Kind, Phone, IsActive, LegacyDriverID)
SELECT Name, 'OnDemand', NULL, IsActive, DriverID FROM Drivers WHERE Type = 'External';
GO

UPDATE vr
SET ProviderID = p.ProviderID, AssignedDriverID = NULL
FROM VehicleRequests vr
JOIN Providers p ON p.LegacyDriverID = vr.AssignedDriverID;
GO

DELETE FROM Drivers WHERE Type = 'External';
GO

ALTER TABLE Providers DROP COLUMN LegacyDriverID;
GO

-- ประเภทคนขับดูจาก ProviderID แทนแล้ว (NULL = คนขับบริษัท, มีค่า = คนขับของบริษัทรถเช่า)
ALTER TABLE Drivers DROP CONSTRAINT CK_Drivers_Type;
GO
ALTER TABLE Drivers DROP COLUMN Type;
GO

-- คำขอที่จัดแล้วต้องมีคนขับที่ลงทะเบียนไว้ หรือผู้ให้บริการเรียกรถออนไลน์
ALTER TABLE VehicleRequests ADD CONSTRAINT CK_VehicleRequests_AssignedHasResource
    CHECK (Status <> 'Assigned' OR AssignedDriverID IS NOT NULL OR ProviderID IS NOT NULL);
GO

-- กันรถคันเดียวกันถูกจัดซ้อนเวลา (UPDLOCK/HOLDLOCK ต้องมี index ถึงจะล็อกแค่ช่วงของรถคันนั้น)
CREATE INDEX IX_VehicleRequests_Vehicle_Time ON VehicleRequests (AssignedVehicleID, DepartTime, ReturnTime);
GO
