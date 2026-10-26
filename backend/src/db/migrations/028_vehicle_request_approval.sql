-- อนุมัติคำขอรถไปงานนอกโดยหัวหน้างาน + ส่งออก PDF แบบฟอร์ม W-HR-009 แทนการแนบไฟล์ (dev + HR 2026-10-05)
--  - ผู้อนุมัติ = ผู้ใช้ที่มีระดับอนุมัติ 1/2/3 (ไม่ผูกกับ role) - ผู้ขอเลือก 1 คน อนุมัติคนเดียวจบ
--  - ผู้อนุมัติอัปโหลดรูปลายเซ็น/ตราประทับครั้งเดียว ใช้ใส่ช่อง Approved by ใน PDF
--  - ApprovalStatus: NotRequired (รถโอที/คำขอเดิมก่อนมีขั้นอนุมัติ), Pending, Approved, Rejected
--    Admin จัดรถได้เมื่อ NotRequired หรือ Approved เท่านั้น

ALTER TABLE Users ADD
    ApprovalLevel TINYINT NULL CONSTRAINT CK_Users_ApprovalLevel CHECK (ApprovalLevel IN (1, 2, 3)),
    SignatureFile VARCHAR(100) NULL;
GO

ALTER TABLE VehicleRequests ADD
    Reason NVARCHAR(500) NULL,
    ApprovalStatus VARCHAR(20) NOT NULL CONSTRAINT DF_VehicleRequests_ApprovalStatus DEFAULT 'NotRequired'
        CONSTRAINT CK_VehicleRequests_ApprovalStatus CHECK (ApprovalStatus IN ('NotRequired', 'Pending', 'Approved', 'Rejected')),
    ApproverUserID INT NULL CONSTRAINT FK_VehicleRequests_Approver REFERENCES Users(UserID),
    ApprovedAt DATETIME2 NULL,
    ApprovalNote NVARCHAR(500) NULL;
GO
