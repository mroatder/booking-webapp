-- รถไปงานนอกเลือกได้ว่า ไปอย่างเดียว / กลับอย่างเดียว / ไป-กลับ (dev ยืนยัน 2026-09-29)
-- ไปหรือกลับอย่างเดียว: ผู้ขอกรอกแค่เวลารับ ระบบกันคนขับ/รถไว้ 2 ชั่วโมง (ReturnTime = DepartTime + 2 ชม.)
ALTER TABLE VehicleRequests
ADD TripType VARCHAR(20) NOT NULL CONSTRAINT DF_VehicleRequests_TripType DEFAULT 'RoundTrip';
GO

ALTER TABLE VehicleRequests
ADD CONSTRAINT CK_VehicleRequests_TripType CHECK (TripType IN ('RoundTrip', 'OneWay', 'ReturnOnly'));
GO
