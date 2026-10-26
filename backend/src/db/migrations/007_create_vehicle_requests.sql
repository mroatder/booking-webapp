-- คำขอใช้รถ - ไม่มีคอลัมน์ TripDate แยก (ต่างจาก ER เดิม) เพราะรองรับทริปข้ามหลายวัน
-- DepartTime/ReturnTime เก็บทั้งวันและเวลาอยู่แล้ว
CREATE TABLE VehicleRequests (
    RequestID           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RequesterUserID     INT             NOT NULL,
    ContactPhone        NVARCHAR(50)    NOT NULL,
    DepartTime          DATETIME2       NOT NULL,
    ReturnTime          DATETIME2       NOT NULL,
    PickupLocation      NVARCHAR(300)   NOT NULL,
    Destination         NVARCHAR(300)   NOT NULL,
    MapLink             NVARCHAR(1000)  NULL,
    VehicleType         VARCHAR(10)     NOT NULL,
    PassengerCount      INT             NOT NULL,
    Status              VARCHAR(20)     NOT NULL CONSTRAINT DF_VehicleRequests_Status DEFAULT 'Pending',
    AssignedDriverID    INT             NULL,
    AssignedByUserID    INT             NULL,
    AssignedAt          DATETIME2       NULL,
    CreatedAt           DATETIME2       NOT NULL CONSTRAINT DF_VehicleRequests_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2       NOT NULL CONSTRAINT DF_VehicleRequests_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_VehicleRequests_Requester FOREIGN KEY (RequesterUserID) REFERENCES Users(UserID),
    CONSTRAINT FK_VehicleRequests_Driver FOREIGN KEY (AssignedDriverID) REFERENCES Drivers(DriverID),
    CONSTRAINT FK_VehicleRequests_AssignedBy FOREIGN KEY (AssignedByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_VehicleRequests_Status CHECK (Status IN ('Pending', 'Assigned', 'Cancelled')),
    CONSTRAINT CK_VehicleRequests_VehicleType CHECK (VehicleType IN ('Van', 'Sedan')),
    CONSTRAINT CK_VehicleRequests_TimeRange CHECK (ReturnTime > DepartTime),
    CONSTRAINT CK_VehicleRequests_Passengers CHECK (PassengerCount > 0),
    CONSTRAINT CK_VehicleRequests_AssignedHasDriver CHECK (Status <> 'Assigned' OR AssignedDriverID IS NOT NULL)
);
GO

-- ใช้กันชนคนขับ (UPDLOCK/HOLDLOCK ต้องมี index ถึงจะล็อกแค่ช่วงของคนขับคนนั้น ไม่ใช่ทั้งตาราง)
CREATE INDEX IX_VehicleRequests_Driver_Time ON VehicleRequests (AssignedDriverID, DepartTime, ReturnTime);
GO

CREATE INDEX IX_VehicleRequests_Requester ON VehicleRequests (RequesterUserID);
GO

CREATE INDEX IX_VehicleRequests_Status_Time ON VehicleRequests (Status, DepartTime);
GO
