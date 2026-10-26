-- สร้าง database + SQL login สำหรับระบบจองห้องประชุมและรถ
-- ใช้ได้ทั้ง dev และ prod เปลี่ยนแค่ค่าตัวแปรด้านล่าง (หรือ override ผ่าน -v ตอนรัน sqlcmd)
--
-- วิธีรัน (ต้องใช้บัญชีที่มีสิทธิ์ sysadmin เช่น sa รันครั้งเดียวตอน setup เท่านั้น
-- แอปจริงจะไม่ใช้บัญชีนี้ต่อ DB - จะใช้ login ที่สร้างขึ้นด้านล่างแทน):
--
--   sqlcmd -S <server>\SQLEXPRESS -U sa -P <sa password> ^
--     -v DbName="booking_project_prod" LoginName="booking_app" LoginPassword="ใส่รหัสผ่านใหม่ที่ปลอดภัย" ^
--     -i setup-database.sql
--
-- ค่า default ด้านล่างคือสำหรับ prod - เปลี่ยน DbName เป็น booking_project_dev ถ้าต้องการสร้างฝั่ง dev

:setvar DbName "booking_project_prod"
:setvar LoginName "booking_app"
:setvar LoginPassword "CHANGE_ME_STRONG_PASSWORD"

IF DB_ID('$(DbName)') IS NULL
BEGIN
    PRINT 'Creating database $(DbName)...';
    EXEC('CREATE DATABASE [$(DbName)] COLLATE Thai_CI_AS');
END
ELSE
    PRINT 'Database $(DbName) already exists, skipping.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '$(LoginName)')
BEGIN
    PRINT 'Creating login $(LoginName)...';
    EXEC('CREATE LOGIN [$(LoginName)] WITH PASSWORD = ''$(LoginPassword)'', CHECK_POLICY = ON');
END
ELSE
    PRINT 'Login $(LoginName) already exists, skipping.';
GO

USE [$(DbName)];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '$(LoginName)')
BEGIN
    PRINT 'Creating database user $(LoginName) with least privilege (read/write data only)...';
    EXEC('CREATE USER [$(LoginName)] FOR LOGIN [$(LoginName)]');
    ALTER ROLE db_datareader ADD MEMBER [$(LoginName)];
    ALTER ROLE db_datawriter ADD MEMBER [$(LoginName)];
    -- ไม่ให้ db_owner: ถ้าแอปถูกเจาะ ผู้โจมตีจะ DROP/ALTER ตารางไม่ได้
    -- npm run migrate ต้องสร้าง/แก้ตาราง → รันด้วยบัญชีแยก (migration login) ที่มี db_ddladmin หรือ db_owner ชั่วคราว
    -- ถ้ายังต้องใช้บัญชีเดียวกันรัน migrate ตอน deploy ให้ GRANT เพิ่ม: ALTER ROLE db_ddladmin ADD MEMBER [$(LoginName)];
END
ELSE
    PRINT 'Database user $(LoginName) already exists, skipping.';
GO

PRINT 'Done. ตั้งค่า backend/.env: DB_HOST=<server>, DB_INSTANCE=SQLEXPRESS, DB_NAME=$(DbName), DB_USER=$(LoginName), DB_PASSWORD=$(LoginPassword)';
GO
