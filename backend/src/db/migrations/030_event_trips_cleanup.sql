-- เดินทางกลุ่ม: ถอน Smart Route / จัดสายรถ (HR: บริษัทรถจัดรถเอง เราแค่ส่งรายชื่อ+จุดขึ้นรถ) และเลิกจำกัดที่นั่ง
-- ใช้กับ DB ที่เคยรัน 029 เวอร์ชันเก่า + migration ชั่วคราวของ Smart Route - ติดตั้งใหม่ไม่มีอะไรต้องลบ
-- ลิงก์ Google Maps จากแถบที่อยู่ยาวเกิน 500 ตัวอักษรได้ง่าย → เก็บได้ 2000
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_EventPassengers_Route')
    ALTER TABLE EventPassengers DROP CONSTRAINT FK_EventPassengers_Route;
GO
IF COL_LENGTH('EventPassengers', 'RouteID') IS NOT NULL ALTER TABLE EventPassengers DROP COLUMN RouteID;
IF COL_LENGTH('EventPassengers', 'Lat') IS NOT NULL ALTER TABLE EventPassengers DROP COLUMN Lat;
IF COL_LENGTH('EventPassengers', 'Lng') IS NOT NULL ALTER TABLE EventPassengers DROP COLUMN Lng;
IF COL_LENGTH('EventPassengers', 'VanGroup') IS NOT NULL ALTER TABLE EventPassengers DROP COLUMN VanGroup;
IF COL_LENGTH('EventPassengers', 'PickupOrder') IS NOT NULL ALTER TABLE EventPassengers DROP COLUMN PickupOrder;
GO
IF OBJECT_ID('EventRoutes', 'U') IS NOT NULL DROP TABLE EventRoutes;
GO
IF COL_LENGTH('EventTrips', 'PlanStartName') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN PlanStartName;
IF COL_LENGTH('EventTrips', 'PlanStartMapUrl') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN PlanStartMapUrl;
IF COL_LENGTH('EventTrips', 'PlanStartLat') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN PlanStartLat;
IF COL_LENGTH('EventTrips', 'PlanStartLng') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN PlanStartLng;
IF COL_LENGTH('EventTrips', 'PlanDestMapUrl') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN PlanDestMapUrl;
IF COL_LENGTH('EventTrips', 'PlanDestLat') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN PlanDestLat;
IF COL_LENGTH('EventTrips', 'PlanDestLng') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN PlanDestLng;
IF COL_LENGTH('EventTrips', 'PlanArrivalAt') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN PlanArrivalAt;
IF COL_LENGTH('EventTrips', 'MaxSeats') IS NOT NULL ALTER TABLE EventTrips DROP COLUMN MaxSeats;
GO
ALTER TABLE EventPassengers ALTER COLUMN GoogleMapUrl NVARCHAR(2000) NULL;
GO
