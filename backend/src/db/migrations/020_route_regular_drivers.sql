-- รถประจำสาย + คนขับประจำ (dev ยืนยัน 2026-09-29): สาย 1 สายมีรถได้หลายคัน แต่ละคันมีคนขับประจำ
-- รถผูกกับสายผ่าน Vehicles.RouteID อยู่แล้ว (migration 014) - เพิ่มคนขับประจำของรถคันนั้น
-- ตั้งค่าจากหน้าจัดการสายรถ และใช้แนะนำรถ/คนขับตอน Admin จัดรถให้คำขอโอที
ALTER TABLE Vehicles ADD RegularDriverID INT NULL CONSTRAINT FK_Vehicles_RegularDriver REFERENCES Drivers(DriverID);
GO

-- คนขับ 1 คนเป็นคนขับประจำได้แค่รถคันเดียว
CREATE UNIQUE INDEX UX_Vehicles_RegularDriver ON Vehicles (RegularDriverID) WHERE RegularDriverID IS NOT NULL;
GO
