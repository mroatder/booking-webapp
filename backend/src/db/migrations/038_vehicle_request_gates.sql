-- ประตูที่ให้รถรับ/ส่ง เมื่อจุดรับหรือปลายทางของรถนอกเป็น "บริษัท" (ไม่บังคับ - กรอกเป็นข้อความอิสระ)
-- รันซ้ำได้: ข้ามคอลัมน์ที่มีอยู่แล้ว (เผื่อมีการรัน SQL ด้วยมือก่อน)
IF COL_LENGTH('VehicleRequests', 'PickupGate') IS NULL
    ALTER TABLE VehicleRequests ADD PickupGate NVARCHAR(100) NULL;
GO

IF COL_LENGTH('VehicleRequests', 'DestinationGate') IS NULL
    ALTER TABLE VehicleRequests ADD DestinationGate NVARCHAR(100) NULL;
GO
