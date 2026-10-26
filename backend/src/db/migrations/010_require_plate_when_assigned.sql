-- คำขอที่จัดคนขับแล้วต้องมีทะเบียนรถเสมอ - แยกจาก 009 เพื่อให้เติมทะเบียนให้คำขอเดิมก่อนได้
-- (ถ้ามีคำขอ Assigned ที่ยังไม่มีทะเบียน migration นี้จะ fail - ไม่เดาข้อมูลให้)
-- ชื่อ/เบอร์คนขับรายทริปของรถภายนอกบังคับที่ระดับ API (CHECK อ้างถึงประเภทคนขับในตารางอื่นไม่ได้)
ALTER TABLE VehicleRequests ADD CONSTRAINT CK_VehicleRequests_AssignedHasPlate
    CHECK (Status <> 'Assigned' OR LicensePlate IS NOT NULL);
GO
