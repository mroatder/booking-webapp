-- เพิ่ม AuthSource = 'None': รายชื่อพนักงานที่ Admin สร้างไว้ใช้เป็นผู้โดยสาร/ผู้ร่วมเดินทางเท่านั้น ไม่ login
-- (พนักงานที่ไม่มีคอมพิวเตอร์) - ไม่มีรหัสผ่าน; Username เป็นค่าภายในที่ระบบสร้างเอง (nologin-...) เพื่อคง UNIQUE/NOT NULL เดิม
ALTER TABLE Users DROP CONSTRAINT CK_Users_AuthSource;
GO

ALTER TABLE Users DROP CONSTRAINT CK_Users_PasswordHash;
GO

ALTER TABLE Users ADD CONSTRAINT CK_Users_AuthSource CHECK (AuthSource IN ('AD', 'Local', 'None'));
GO

ALTER TABLE Users ADD CONSTRAINT CK_Users_PasswordHash CHECK (
    (AuthSource = 'Local' AND PasswordHash IS NOT NULL) OR
    (AuthSource IN ('AD', 'None') AND PasswordHash IS NULL)
);
GO
