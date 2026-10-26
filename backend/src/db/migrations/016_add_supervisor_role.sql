-- เพิ่ม Role 'Supervisor' สำหรับหัวหน้างานที่สามารถขอรถให้พนักงานได้
ALTER TABLE Users DROP CONSTRAINT CK_Users_Role;
GO

ALTER TABLE Users ADD CONSTRAINT CK_Users_Role CHECK (Role IN ('Employee', 'Supervisor', 'Admin'));
GO
