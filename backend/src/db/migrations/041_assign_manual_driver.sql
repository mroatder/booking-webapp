-- จัดรถแบบ "พิมพ์เอง" (Manual): กรอกชื่อ/เบอร์คนขับและทะเบียนเป็นข้อความรายเที่ยว ไม่ผูกคนขับ/รถ/ผู้ให้บริการในระบบ
-- constraint เดิมบังคับว่าคำขอที่จัดแล้วต้องมี DriverID หรือ ProviderID - ผ่อนเป็นมี TripDriverName ก็ได้
-- รันซ้ำได้: ลบแล้วสร้างใหม่
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_VehicleRequests_AssignedHasResource')
    ALTER TABLE VehicleRequests DROP CONSTRAINT CK_VehicleRequests_AssignedHasResource;
GO

ALTER TABLE VehicleRequests ADD CONSTRAINT CK_VehicleRequests_AssignedHasResource
    CHECK (Status <> 'Assigned' OR AssignedDriverID IS NOT NULL OR ProviderID IS NOT NULL OR TripDriverName IS NOT NULL);
GO
