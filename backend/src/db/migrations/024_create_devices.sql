-- อุปกรณ์ (จอ tablet หน้าห้อง) แยกเป็นตารางของตัวเอง - เดิม token/LastSeenAt อยู่ในตาราง Rooms (1 ห้อง = 1 จอ)
-- ทำให้เพิ่ม/ลบอุปกรณ์ไม่ได้ (dev 2026-09-29: "จัดการอุปกรณ์ยังเพิ่ม ลบไม่ได้เลย")
-- ตอนนี้: 1 ห้องมีได้หลายจอ, จอที่ยังไม่ผูกห้อง (RoomID NULL) มีได้ - ลบห้องแล้วจอกลายเป็น "ยังไม่ผูกห้อง"
CREATE TABLE Devices (
    DeviceID    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name        NVARCHAR(200)   NOT NULL,
    RoomID      INT             NULL,
    Token       VARCHAR(64)     NOT NULL,
    LastSeenAt  DATETIME2       NULL,
    CreatedAt   DATETIME2       NOT NULL CONSTRAINT DF_Devices_CreatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_Devices_Room FOREIGN KEY (RoomID) REFERENCES Rooms(RoomID) ON DELETE SET NULL,
    CONSTRAINT UQ_Devices_Token UNIQUE (Token)
);
GO

-- ย้ายจอเดิม: ห้องละ 1 จอ ใช้ token เดิม - tablet ที่ติดตั้งแล้วใช้ลิงก์เดิมต่อได้เลย
INSERT INTO Devices (Name, RoomID, Token, LastSeenAt)
SELECT N'จอหน้าห้อง ' + Name, RoomID, TabletToken, LastSeenAt FROM Rooms;
GO

ALTER TABLE Rooms DROP CONSTRAINT UQ_Rooms_TabletToken;
GO
ALTER TABLE Rooms DROP COLUMN TabletToken, LastSeenAt;
GO
