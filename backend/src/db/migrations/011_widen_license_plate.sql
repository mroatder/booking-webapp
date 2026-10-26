-- ทะเบียนรถไทยพร้อมชื่อจังหวัดเต็มยาวเกิน 20 ตัวอักษรได้ (เช่น "1กข 9999 พระนครศรีอยุธยา")
-- ต้องถอด CHECK ที่อ้างคอลัมน์นี้ก่อน ALTER COLUMN แล้วใส่กลับ (SQL Server ไม่ยอมแก้คอลัมน์ที่มี constraint อ้างถึง)
ALTER TABLE VehicleRequests DROP CONSTRAINT CK_VehicleRequests_AssignedHasPlate;
GO
ALTER TABLE VehicleRequests ALTER COLUMN LicensePlate NVARCHAR(50) NULL;
GO
ALTER TABLE VehicleRequests ADD CONSTRAINT CK_VehicleRequests_AssignedHasPlate
    CHECK (Status <> 'Assigned' OR LicensePlate IS NOT NULL);
GO
