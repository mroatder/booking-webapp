-- M9 Audit Log: บันทึกว่าใครทำอะไรกับอะไรเมื่อไหร่ (REQUIREMENTS § ระบบ/ความปลอดภัยข้อมูล ข้อ 3)
-- ไม่ใส่ FOREIGN KEY ที่ UserID โดยตั้งใจ: log ต้องอยู่ครบแม้ผู้ใช้ถูกลบ/ย้ายระบบ และการเขียน log ต้องไม่ถูกบล็อกด้วย constraint
CREATE TABLE AuditLogs (
    AuditLogID  BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    CreatedAt   DATETIME2       NOT NULL CONSTRAINT DF_AuditLogs_CreatedAt DEFAULT SYSUTCDATETIME(),
    UserID      INT             NULL,           -- ผู้กระทำที่ login แล้ว (NULL = ระบบ/จอ tablet/ยังไม่ได้ login)
    Actor       NVARCHAR(100)   NULL,           -- ชื่อผู้กระทำที่ไม่ใช่ผู้ใช้: 'system', 'tablet', หรือ username ที่พยายาม login
    Action      VARCHAR(80)     NOT NULL,       -- รหัส action เช่น booking.create, vehicleRequest.approve
    EntityType  VARCHAR(40)     NULL,           -- booking, vehicleRequest, user, room, ...
    EntityID    INT             NULL,
    Method      VARCHAR(10)     NULL,
    Path        NVARCHAR(300)   NULL,           -- path แบบแทน id เป็น :id เช่น /bookings/:id/checkin
    StatusCode  INT             NULL,
    IpAddress   VARCHAR(64)     NULL,
    Details     NVARCHAR(MAX)   NULL            -- JSON: { before, body, query } (ตัดข้อมูลลับออกแล้ว)
);
GO

CREATE INDEX IX_AuditLogs_CreatedAt ON AuditLogs (CreatedAt DESC);
CREATE INDEX IX_AuditLogs_User      ON AuditLogs (UserID, CreatedAt DESC);
CREATE INDEX IX_AuditLogs_Entity    ON AuditLogs (EntityType, EntityID, CreatedAt DESC);
CREATE INDEX IX_AuditLogs_Action    ON AuditLogs (Action, CreatedAt DESC);
GO
