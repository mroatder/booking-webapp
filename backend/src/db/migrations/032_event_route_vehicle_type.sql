-- สายรถของเดินทางกลุ่มระบุประเภทรถ (รถตู้/รถเก๋ง) - ค่าเดิมที่ไม่เคยระบุถือเป็นรถตู้
IF COL_LENGTH('EventRoutes', 'VehicleType') IS NULL
BEGIN
    ALTER TABLE EventRoutes ADD VehicleType VARCHAR(20) NOT NULL
        CONSTRAINT DF_EventRoutes_VehicleType DEFAULT 'Van'
        CONSTRAINT CK_EventRoutes_VehicleType CHECK (VehicleType IN ('Van', 'Sedan'));
END;
GO
