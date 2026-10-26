CREATE TABLE RoomBookings (
    BookingID           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RoomID              INT             NOT NULL,
    UserID              INT             NOT NULL,
    Title               NVARCHAR(300)   NOT NULL,
    StartTime           DATETIME2       NOT NULL,
    EndTime             DATETIME2       NOT NULL,
    RecurrenceGroupID   VARCHAR(36)     NULL,
    Status              VARCHAR(20)     NOT NULL CONSTRAINT DF_RoomBookings_Status DEFAULT 'Booked',
    CheckedInAt         DATETIME2       NULL,
    CreatedAt           DATETIME2       NOT NULL CONSTRAINT DF_RoomBookings_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2       NOT NULL CONSTRAINT DF_RoomBookings_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_RoomBookings_Room FOREIGN KEY (RoomID) REFERENCES Rooms(RoomID),
    CONSTRAINT FK_RoomBookings_User FOREIGN KEY (UserID) REFERENCES Users(UserID),
    CONSTRAINT CK_RoomBookings_Status CHECK (Status IN ('Booked', 'CheckedIn', 'AutoReleased', 'Cancelled')),
    CONSTRAINT CK_RoomBookings_TimeRange CHECK (EndTime > StartTime)
);
GO

CREATE INDEX IX_RoomBookings_Room_Time ON RoomBookings (RoomID, StartTime, EndTime);
GO

CREATE INDEX IX_RoomBookings_User ON RoomBookings (UserID);
GO

CREATE INDEX IX_RoomBookings_RecurrenceGroup ON RoomBookings (RecurrenceGroupID);
GO
