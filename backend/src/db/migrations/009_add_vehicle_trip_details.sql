-- ข้อมูลรถ/คนขับรายทริป (dev ยืนยัน 2026-09-28):
-- - LicensePlate: ทะเบียนรถที่ใช้จริง กรอกทุกครั้งที่จัดคนขับ (ทั้งรถบริษัทและรถภายนอก)
-- - TripDriverName/TripDriverPhone: คนขับจริงของทริป ใช้เฉพาะรถภายนอก (เช่น Grab) ที่คนขับเปลี่ยนทุกเที่ยว
--   ส่วน Drivers ประเภท External กลายเป็น "ผู้ให้บริการ" (Grab, บริษัทรถเช่า) แทนตัวคนขับ
ALTER TABLE VehicleRequests ADD
    LicensePlate    NVARCHAR(20)    NULL,
    TripDriverName  NVARCHAR(200)   NULL,
    TripDriverPhone NVARCHAR(50)    NULL;
GO
