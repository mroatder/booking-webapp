-- dev ตัดสินใจไม่เก็บความจุห้อง (capacity) อีกต่อไปหลัง M2 (ดู docs/PROGRESS.md)
DECLARE @constraintName NVARCHAR(200);
SELECT @constraintName = name FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('Rooms') AND definition LIKE '%Capacity%';

IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE Rooms DROP CONSTRAINT ' + @constraintName);
GO

ALTER TABLE Rooms DROP COLUMN Capacity;
GO
