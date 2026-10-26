-- สร้างตาราง EventTrips และ EventPassengers สำหรับระบบรถตู้งานกิจกรรม/เดินทางกลุ่ม
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EventTrips')
BEGIN
    CREATE TABLE EventTrips (
        EventID INT IDENTITY(1,1) PRIMARY KEY,
        Title NVARCHAR(200) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        Destination NVARCHAR(200) NOT NULL,
        EventDate DATETIME2 NOT NULL,
        ReturnDate DATETIME2 NULL,
        RegistrationDeadline DATETIME2 NULL,
        CreatedByUserID INT NOT NULL CONSTRAINT FK_EventTrips_CreatedBy REFERENCES Users(UserID),
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EventPassengers')
BEGIN
    CREATE TABLE EventPassengers (
        PassengerID INT IDENTITY(1,1) PRIMARY KEY,
        EventID INT NOT NULL CONSTRAINT FK_EventPassengers_Event REFERENCES EventTrips(EventID) ON DELETE CASCADE,
        UserID INT NULL CONSTRAINT FK_EventPassengers_User REFERENCES Users(UserID),
        PassengerName NVARCHAR(150) NOT NULL,
        EmployeeCode NVARCHAR(50) NULL,
        Department NVARCHAR(100) NULL,
        PhoneNumber NVARCHAR(50) NOT NULL,
        PickupLocation NVARCHAR(250) NOT NULL,
        GoogleMapUrl NVARCHAR(2000) NULL,
        TripType VARCHAR(20) NOT NULL DEFAULT 'RoundTrip' CONSTRAINT CK_EventPassengers_TripType CHECK (TripType IN ('RoundTrip', 'GoOnly', 'ReturnOnly')),
        Note NVARCHAR(500) NULL,
        RegisteredByUserID INT NOT NULL CONSTRAINT FK_EventPassengers_RegisteredBy REFERENCES Users(UserID),
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO
