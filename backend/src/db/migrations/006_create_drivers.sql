-- คนขับ (ภายใน/ภายนอก) - ไม่ผูกกับ Users เพราะคนขับไม่มี login/account ในระบบ
-- ปิดใช้งานแทนการลบ (IsActive = 0) เพื่อให้คำขอรถเก่าที่เคยมอบหมายยังอ้างอิงได้
CREATE TABLE Drivers (
    DriverID        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name            NVARCHAR(200)   NOT NULL,
    Phone           NVARCHAR(50)    NULL,
    Type            VARCHAR(10)     NOT NULL,
    IsActive        BIT             NOT NULL CONSTRAINT DF_Drivers_IsActive DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL CONSTRAINT DF_Drivers_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL CONSTRAINT DF_Drivers_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_Drivers_Type CHECK (Type IN ('Internal', 'External'))
);
GO
