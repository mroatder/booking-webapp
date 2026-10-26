-- สายรวมโอที: Admin รวมคำขอโอทีเที่ยวเดียวกัน (เวลา/จุดรับ-ปลายทางตรงกัน) จากหลายสายให้เป็นเที่ยวเดียว
-- ไม่แก้สายประจำของพนักงาน - จุดขึ้น/ลงยังใช้ของแต่ละคนจาก ShuttlePassengers; ว่าง = ไม่ได้รวม
-- รันซ้ำได้: ข้ามของที่มีอยู่แล้ว
IF OBJECT_ID('ShuttleCombinedTrips', 'U') IS NULL
    CREATE TABLE ShuttleCombinedTrips (
        CombinedTripID  INT IDENTITY(1,1) PRIMARY KEY,
        CreatedByUserID INT NOT NULL,
        CreatedAt       DATETIME2 NOT NULL CONSTRAINT DF_ShuttleCombinedTrips_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ShuttleCombinedTrips_User FOREIGN KEY (CreatedByUserID) REFERENCES Users(UserID)
    );
GO

IF COL_LENGTH('VehicleRequests', 'CombinedTripID') IS NULL
    ALTER TABLE VehicleRequests ADD CombinedTripID INT NULL
        CONSTRAINT FK_VehicleRequests_CombinedTrip REFERENCES ShuttleCombinedTrips(CombinedTripID);
GO
