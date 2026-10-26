-- ลิงก์แผนที่เป็นข้อมูลบังคับของคำขอรถ (dev ยืนยัน 2026-09-28: ทุกช่องในฟอร์มขอรถต้องกรอก)
-- ถ้ามีแถวเก่าที่ยังไม่มีลิงก์ migration นี้จะ fail - ต้องให้ Admin เติมลิงก์ก่อน ไม่เดาข้อมูลให้
ALTER TABLE VehicleRequests ALTER COLUMN MapLink NVARCHAR(1000) NOT NULL;
GO
