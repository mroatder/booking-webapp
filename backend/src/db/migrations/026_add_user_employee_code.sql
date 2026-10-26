IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('Users') AND name = 'EmployeeCode'
)
BEGIN
    ALTER TABLE Users ADD EmployeeCode NVARCHAR(50) NULL;
END;
GO
