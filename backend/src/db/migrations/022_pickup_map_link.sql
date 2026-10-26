-- จุดรับและจุดส่งแนบแผนที่แยกกัน (dev ยืนยัน 2026-09-29) - ถ้าจุดนั้นเป็นบริษัท ติ๊ก "ที่บริษัท" ไม่ต้องแนบแผนที่
-- MapLink เดิม = แผนที่ปลายทาง (ใช้ต่อ), เพิ่ม PickupMapLink = แผนที่จุดรับ
-- MapLink กลับมาเป็น NULL ได้: จุดที่เป็นบริษัท / คำขอโอทีไม่มีแผนที่ (เดิมเก็บเป็นสตริงว่าง)
ALTER TABLE VehicleRequests ALTER COLUMN MapLink NVARCHAR(1000) NULL;
GO

ALTER TABLE VehicleRequests ADD PickupMapLink NVARCHAR(1000) NULL;
GO

UPDATE VehicleRequests SET MapLink = NULL WHERE MapLink = '';
GO
