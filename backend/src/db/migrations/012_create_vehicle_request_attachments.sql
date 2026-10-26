-- ไฟล์แบบฟอร์มขอใช้รถ (PDF/JPG/PNG) ที่ผู้ขอแนบ - dev ยืนยัน 2026-09-28: บังคับแนบอย่างน้อย 1 ไฟล์
-- สูงสุด 5 ไฟล์ต่อคำขอ, ไฟล์ละไม่เกิน 10 MB
-- ตัวไฟล์เก็บบนดิสก์ที่ UPLOAD_DIR (ไม่เก็บใน DB เพราะ SQL Server Express จำกัดขนาด database 10 GB)
-- StoredName = ชื่อสุ่ม (UUID + นามสกุล) ไม่ใช้ชื่อไฟล์จากผู้ใช้เป็น path เลย กัน path traversal
CREATE TABLE VehicleRequestAttachments (
    AttachmentID        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RequestID           INT             NOT NULL,
    OriginalName        NVARCHAR(255)   NOT NULL,
    StoredName          VARCHAR(100)    NOT NULL,
    ContentType         VARCHAR(50)     NOT NULL,
    SizeBytes           INT             NOT NULL,
    UploadedByUserID    INT             NOT NULL,
    CreatedAt           DATETIME2       NOT NULL CONSTRAINT DF_VehicleRequestAttachments_CreatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_VehicleRequestAttachments_Request FOREIGN KEY (RequestID) REFERENCES VehicleRequests(RequestID),
    CONSTRAINT FK_VehicleRequestAttachments_User FOREIGN KEY (UploadedByUserID) REFERENCES Users(UserID),
    CONSTRAINT UQ_VehicleRequestAttachments_StoredName UNIQUE (StoredName),
    CONSTRAINT CK_VehicleRequestAttachments_ContentType CHECK (ContentType IN ('application/pdf', 'image/jpeg', 'image/png'))
);
GO

CREATE INDEX IX_VehicleRequestAttachments_Request ON VehicleRequestAttachments (RequestID);
GO
