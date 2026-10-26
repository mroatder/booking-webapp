-- ผู้รับแจ้งเตือนของกิจกรรมเดินทางกลุ่ม: Admin เลือกตอนสร้าง - ทุกคน (NotifyAll) หรือเลือกเป็นรายคน (EventInvitees)
-- ใช้ส่งอีเมล "เปิดลงชื่อ" ตอนสร้าง และเตือนใกล้ปิดรับให้คนที่ยังไม่ลงชื่อ (ไม่จำกัดว่าใครลงชื่อได้ - แค่ใครได้รับอีเมล)
IF COL_LENGTH('EventTrips', 'NotifyAll') IS NULL
    ALTER TABLE EventTrips ADD NotifyAll BIT NOT NULL CONSTRAINT DF_EventTrips_NotifyAll DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EventInvitees')
BEGIN
    CREATE TABLE EventInvitees (
        EventID INT NOT NULL CONSTRAINT FK_EventInvitees_Event REFERENCES EventTrips(EventID),
        UserID  INT NOT NULL CONSTRAINT FK_EventInvitees_User REFERENCES Users(UserID),
        CONSTRAINT PK_EventInvitees PRIMARY KEY (EventID, UserID)
    );
END;
GO
