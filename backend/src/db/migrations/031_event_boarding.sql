-- รายละเอียดการขึ้นรถของเดินทางกลุ่ม: หลังส่งรายชื่อให้บริษัทรถแล้ว Admin กรอกว่าใครขึ้นสายไหน กี่โมง รถทะเบียนอะไร คนขับคือใคร
-- (คนขับ/รถเป็นของบริษัทรถภายนอก จึงเก็บเป็นข้อความ ไม่ผูกกับตารางคนขับ/รถในระบบ) แล้ว "ประกาศ" ให้พนักงานเห็น
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EventRoutes')
BEGIN
    CREATE TABLE EventRoutes (
        RouteID INT IDENTITY(1,1) PRIMARY KEY,
        EventID INT NOT NULL CONSTRAINT FK_EventRoutes_Event REFERENCES EventTrips(EventID),
        RouteNo INT NOT NULL,
        RouteName NVARCHAR(100) NOT NULL,
        VehiclePlate NVARCHAR(50) NULL,
        DriverName NVARCHAR(150) NULL,
        DriverPhone NVARCHAR(50) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF COL_LENGTH('EventPassengers', 'RouteID') IS NULL
BEGIN
    ALTER TABLE EventPassengers ADD
        RouteID INT NULL CONSTRAINT FK_EventPassengers_Route REFERENCES EventRoutes(RouteID),
        BoardingAt DATETIME2 NULL;
END;
GO

IF COL_LENGTH('EventTrips', 'BoardingPublishedAt') IS NULL
BEGIN
    ALTER TABLE EventTrips ADD BoardingPublishedAt DATETIME2 NULL;
END;
GO
