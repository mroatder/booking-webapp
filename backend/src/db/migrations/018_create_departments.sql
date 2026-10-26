CREATE TABLE Departments (
    DepartmentID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    ParentDepartmentID INT NULL,

    CONSTRAINT FK_Departments_Parent FOREIGN KEY (ParentDepartmentID) REFERENCES Departments(DepartmentID) ON DELETE NO ACTION
);
GO

-- สร้างแผนกเริ่มต้นจากข้อมูล Department เดิมใน Users
INSERT INTO Departments (Name)
SELECT DISTINCT Department
FROM Users
WHERE Department IS NOT NULL AND RTRIM(LTRIM(Department)) <> '';
GO

-- เพิ่มคอลัมน์ DepartmentID เข้าไปใน Users
ALTER TABLE Users ADD DepartmentID INT NULL CONSTRAINT FK_Users_Department FOREIGN KEY REFERENCES Departments(DepartmentID) ON DELETE SET NULL;
GO

-- แมปข้อมูลเดิมเข้ากับ DepartmentID
UPDATE u
SET u.DepartmentID = d.DepartmentID
FROM Users u
JOIN Departments d ON LTRIM(RTRIM(u.Department)) = d.Name
WHERE u.Department IS NOT NULL;
GO

-- ลบคอลัมน์ Department เดิมทิ้ง
ALTER TABLE Users DROP COLUMN Department;
GO
