CREATE TABLE Users (
    UserID          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Username        NVARCHAR(100)   NOT NULL,
    PasswordHash    NVARCHAR(255)   NULL,       -- NULL ถ้า AuthSource = 'AD'
    FullName        NVARCHAR(200)   NOT NULL,
    Department      NVARCHAR(200)   NULL,
    Phone           NVARCHAR(50)    NULL,
    Email           NVARCHAR(255)   NULL,
    Role            VARCHAR(20)     NOT NULL CONSTRAINT DF_Users_Role DEFAULT 'Employee',
    AuthSource      VARCHAR(10)     NOT NULL,
    IsActive        BIT             NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT UQ_Users_Username UNIQUE (Username),
    CONSTRAINT CK_Users_Role CHECK (Role IN ('Employee', 'Admin')),
    CONSTRAINT CK_Users_AuthSource CHECK (AuthSource IN ('AD', 'Local')),
    CONSTRAINT CK_Users_PasswordHash CHECK (
        (AuthSource = 'Local' AND PasswordHash IS NOT NULL) OR
        (AuthSource = 'AD' AND PasswordHash IS NULL)
    )
);
GO
