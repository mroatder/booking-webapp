-- สายรถ/จุดขึ้นรถของผู้โดยสารในคำขอ: เก็บสำเนา ณ ตอนส่งคำขอ
-- (ย้ายสาย/ย้ายจุดขึ้นรถภายหลัง ต้องไม่ทำให้คำขอเก่าและรายงานย้อนหลังเปลี่ยนตาม)
-- ไม่ผูก FK กับ ShuttleRoutes เพื่อให้ลบสายที่เลิกใช้ได้โดยประวัติยังอยู่ (เก็บชื่อสายไว้เอง)
-- รันซ้ำได้: ข้ามคอลัมน์ที่มีอยู่แล้ว
IF COL_LENGTH('VehicleRequestPassengers', 'RouteID') IS NULL
    ALTER TABLE VehicleRequestPassengers ADD RouteID INT NULL;
IF COL_LENGTH('VehicleRequestPassengers', 'RouteName') IS NULL
    ALTER TABLE VehicleRequestPassengers ADD RouteName NVARCHAR(100) NULL;
IF COL_LENGTH('VehicleRequestPassengers', 'PickupStop') IS NULL
    ALTER TABLE VehicleRequestPassengers ADD PickupStop NVARCHAR(200) NULL;
GO

-- คำขอที่มีอยู่แล้ว: เติมจากสายปัจจุบันของพนักงาน (ไม่มีข้อมูลเก่ากว่านี้ให้เติม) - เติมเฉพาะแถวที่ยังว่าง
UPDATE vp
SET vp.RouteID = sp.RouteID, vp.RouteName = sr.Name, vp.PickupStop = sp.PickupStop
FROM VehicleRequestPassengers vp
JOIN ShuttlePassengers sp ON sp.UserID = vp.UserID
JOIN ShuttleRoutes sr ON sr.RouteID = sp.RouteID
WHERE vp.RouteID IS NULL AND vp.RouteName IS NULL AND vp.PickupStop IS NULL;
GO
