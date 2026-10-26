CREATE TABLE Rooms (
    RoomID          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name            NVARCHAR(200)   NOT NULL,
    Capacity        INT             NOT NULL CONSTRAINT CK_Rooms_Capacity CHECK (Capacity > 0),
    Floor           NVARCHAR(100)   NULL,
    TabletToken     VARCHAR(64)     NOT NULL,
    CreatedAt       DATETIME2       NOT NULL CONSTRAINT DF_Rooms_CreatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT UQ_Rooms_TabletToken UNIQUE (TabletToken)
);
GO
