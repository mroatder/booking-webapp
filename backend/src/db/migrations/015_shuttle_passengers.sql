-- ข้อมูลผู้โดยสารรถรับส่ง (1 พนักงาน มี 1 สายรถประจำ และ 1 จุดรับส่ง)
CREATE TABLE ShuttlePassengers (
    UserID      INT NOT NULL PRIMARY KEY,
    RouteID     INT NOT NULL,
    PickupStop  NVARCHAR(200) NOT NULL,
    CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_ShuttlePassengers_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt   DATETIME2 NOT NULL CONSTRAINT DF_ShuttlePassengers_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_ShuttlePassengers_User FOREIGN KEY (UserID) REFERENCES Users(UserID),
    CONSTRAINT FK_ShuttlePassengers_Route FOREIGN KEY (RouteID) REFERENCES ShuttleRoutes(RouteID)
);
GO
