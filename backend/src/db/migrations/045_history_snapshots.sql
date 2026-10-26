-- สำเนาข้อมูล ณ เวลาที่เกิดเหตุการณ์ (ส่งคำขอ / อนุมัติ / จัดรถ / จองห้อง) เพื่อให้ประวัติและรายงานย้อนหลังไม่เปลี่ยน
-- เมื่อข้อมูลหลักถูกแก้ภายหลัง (ย้ายแผนก เปลี่ยนลายเซ็น/ระดับผู้อนุมัติ แก้เบอร์คนขับ ฯลฯ)
-- คอลัมน์ Snap* ว่าง = ใช้ข้อมูลปัจจุบัน (เช่น ผู้อนุมัติที่ยังไม่ตัดสิน) - อ่านผ่าน COALESCE(Snap*, ข้อมูลปัจจุบัน)
-- รันซ้ำได้: ข้ามคอลัมน์ที่มีอยู่แล้ว

-- ผู้ขอ
IF COL_LENGTH('VehicleRequests', 'SnapRequesterName') IS NULL ALTER TABLE VehicleRequests ADD SnapRequesterName NVARCHAR(200) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapRequesterNameTh') IS NULL ALTER TABLE VehicleRequests ADD SnapRequesterNameTh NVARCHAR(200) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapRequesterDepartment') IS NULL ALTER TABLE VehicleRequests ADD SnapRequesterDepartment NVARCHAR(200) NULL;
-- ผู้อนุมัติ (บันทึกตอนตัดสิน) - ไฟล์ลายเซ็นที่ถูกอ้างอยู่จะไม่ถูกลบตอนผู้อนุมัติเปลี่ยนลายเซ็น
IF COL_LENGTH('VehicleRequests', 'SnapApproverName') IS NULL ALTER TABLE VehicleRequests ADD SnapApproverName NVARCHAR(200) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapApproverNameTh') IS NULL ALTER TABLE VehicleRequests ADD SnapApproverNameTh NVARCHAR(200) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapApproverLevel') IS NULL ALTER TABLE VehicleRequests ADD SnapApproverLevel INT NULL;
IF COL_LENGTH('VehicleRequests', 'SnapApproverSignatureFile') IS NULL ALTER TABLE VehicleRequests ADD SnapApproverSignatureFile VARCHAR(100) NULL;
-- คนขับ / ผู้ให้บริการ / รถ (บันทึกตอนจัดรถ)
IF COL_LENGTH('VehicleRequests', 'SnapDriverName') IS NULL ALTER TABLE VehicleRequests ADD SnapDriverName NVARCHAR(200) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapDriverPhone') IS NULL ALTER TABLE VehicleRequests ADD SnapDriverPhone NVARCHAR(50) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapProviderName') IS NULL ALTER TABLE VehicleRequests ADD SnapProviderName NVARCHAR(200) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapProviderPhone') IS NULL ALTER TABLE VehicleRequests ADD SnapProviderPhone NVARCHAR(50) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapVehicleType') IS NULL ALTER TABLE VehicleRequests ADD SnapVehicleType VARCHAR(20) NULL;
IF COL_LENGTH('VehicleRequests', 'SnapSeatCount') IS NULL ALTER TABLE VehicleRequests ADD SnapSeatCount INT NULL;
IF COL_LENGTH('VehicleRequests', 'SnapVehicleDescription') IS NULL ALTER TABLE VehicleRequests ADD SnapVehicleDescription NVARCHAR(200) NULL;
-- ผู้โดยสารในคำขอ / ผู้จองห้อง
IF COL_LENGTH('VehicleRequestPassengers', 'Department') IS NULL ALTER TABLE VehicleRequestPassengers ADD Department NVARCHAR(200) NULL;
IF COL_LENGTH('RoomBookings', 'SnapUserDepartment') IS NULL ALTER TABLE RoomBookings ADD SnapUserDepartment NVARCHAR(200) NULL;
GO

-- รายการที่มีอยู่แล้ว: เติมจากข้อมูลปัจจุบัน (ไม่มีข้อมูลเก่ากว่านี้ให้เติม) - เติมเฉพาะแถวที่ยังว่าง
UPDATE vr SET
    SnapRequesterName = COALESCE(vr.SnapRequesterName, u.FullName),
    SnapRequesterNameTh = COALESCE(vr.SnapRequesterNameTh, u.FullNameTh),
    SnapRequesterDepartment = COALESCE(vr.SnapRequesterDepartment, ud.Name)
FROM VehicleRequests vr
JOIN Users u ON u.UserID = vr.RequesterUserID
LEFT JOIN Departments ud ON ud.DepartmentID = u.DepartmentID;

UPDATE vr SET
    SnapApproverName = COALESCE(vr.SnapApproverName, ap.FullName),
    SnapApproverNameTh = COALESCE(vr.SnapApproverNameTh, ap.FullNameTh),
    SnapApproverLevel = COALESCE(vr.SnapApproverLevel, ap.ApprovalLevel),
    SnapApproverSignatureFile = COALESCE(vr.SnapApproverSignatureFile, ap.SignatureFile)
FROM VehicleRequests vr
JOIN Users ap ON ap.UserID = vr.ApproverUserID
WHERE vr.ApprovalStatus IN ('Approved', 'Rejected');

UPDATE vr SET
    SnapDriverName = COALESCE(vr.SnapDriverName, d.Name),
    SnapDriverPhone = COALESCE(vr.SnapDriverPhone, d.Phone),
    SnapProviderName = COALESCE(vr.SnapProviderName, p.Name),
    SnapProviderPhone = COALESCE(vr.SnapProviderPhone, p.Phone),
    SnapVehicleType = COALESCE(vr.SnapVehicleType, v.VehicleType),
    SnapSeatCount = COALESCE(vr.SnapSeatCount, v.SeatCount),
    SnapVehicleDescription = COALESCE(vr.SnapVehicleDescription, v.Description)
FROM VehicleRequests vr
LEFT JOIN Drivers d ON d.DriverID = vr.AssignedDriverID
LEFT JOIN Providers p ON p.ProviderID = vr.ProviderID
LEFT JOIN Vehicles v ON v.VehicleID = vr.AssignedVehicleID
WHERE vr.Status = 'Assigned';

UPDATE vp SET Department = COALESCE(vp.Department, dep.Name)
FROM VehicleRequestPassengers vp
JOIN Users u ON u.UserID = vp.UserID
LEFT JOIN Departments dep ON dep.DepartmentID = u.DepartmentID;

UPDATE b SET SnapUserDepartment = COALESCE(b.SnapUserDepartment, d.Name)
FROM RoomBookings b
JOIN Users u ON u.UserID = b.UserID
LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID;
GO
