-- สายรถรับส่งพนักงานของบริษัทรถเช่า (dev ยืนยัน 2026-09-28): ลงทะเบียนสายแยก แล้วผูกรถเข้าสาย
-- เก็บ ชื่อสาย / ต้นทาง / ปลายทาง / จุดจอดระหว่างทาง / เวลาวิ่งเช้า-เย็น / วันที่วิ่ง
-- เวลาวิ่งใช้แค่เตือนตอนจัดรถไปงานอื่น (ไม่บล็อก - บางวันสายไม่วิ่ง เช่น วันหยุด)
-- เวลาเก็บเป็นข้อความ 'HH:mm' เวลาท้องถิ่น (ไม่ใช้ชนิด TIME เพราะ driver แปลงเป็น Date แบบ UTC ให้สับสน)
CREATE TABLE ShuttleRoutes (
    RouteID         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ProviderID      INT             NOT NULL,
    Name            NVARCHAR(100)   NOT NULL,
    Origin          NVARCHAR(200)   NOT NULL,
    Destination     NVARCHAR(200)   NOT NULL,
    StopsJson       NVARCHAR(2000)  NULL,       -- JSON array ของชื่อจุดจอดตามลำดับ
    MorningDepart   CHAR(5)         NULL,
    MorningArrive   CHAR(5)         NULL,
    EveningDepart   CHAR(5)         NULL,
    EveningArrive   CHAR(5)         NULL,
    RunDays         CHAR(7)         NOT NULL CONSTRAINT DF_ShuttleRoutes_RunDays DEFAULT '1111100', -- จ.-อา. (1 = วิ่ง)
    IsActive        BIT             NOT NULL CONSTRAINT DF_ShuttleRoutes_IsActive DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL CONSTRAINT DF_ShuttleRoutes_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL CONSTRAINT DF_ShuttleRoutes_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_ShuttleRoutes_Provider FOREIGN KEY (ProviderID) REFERENCES Providers(ProviderID),
    CONSTRAINT CK_ShuttleRoutes_RunDays CHECK (RunDays NOT LIKE '%[^01]%'),
    CONSTRAINT CK_ShuttleRoutes_Morning CHECK ((MorningDepart IS NULL AND MorningArrive IS NULL) OR (MorningDepart IS NOT NULL AND MorningArrive IS NOT NULL AND MorningArrive > MorningDepart)),
    CONSTRAINT CK_ShuttleRoutes_Evening CHECK ((EveningDepart IS NULL AND EveningArrive IS NULL) OR (EveningDepart IS NOT NULL AND EveningArrive IS NOT NULL AND EveningArrive > EveningDepart))
);
GO

-- รถ 1 คันอยู่ได้ 1 สาย (สาย 1 สายมีได้หลายคัน) - เฉพาะรถของบริษัทรถเช่าเจ้าของสายนั้น (เช็คที่ API)
ALTER TABLE Vehicles ADD RouteID INT NULL CONSTRAINT FK_Vehicles_Route REFERENCES ShuttleRoutes(RouteID);
GO
