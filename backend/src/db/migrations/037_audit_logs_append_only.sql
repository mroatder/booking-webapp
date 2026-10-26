-- Audit log เขียนเพิ่มได้อย่างเดียว: ห้าม UPDATE/DELETE แถวเดิม (กันผู้ไม่หวังดีหรือบั๊กในแอปลบ/แก้หลักฐานย้อนหลัง)
-- ใช้ trigger แทน DENY เพราะบัญชีแอปอาจเป็น db_owner ซึ่ง DENY ไม่ครอบคลุม
-- ถ้าต้องล้าง log เก่าตามนโยบายเก็บข้อมูล: ให้ DBA ปิด trigger ชั่วคราว (DISABLE TRIGGER TR_AuditLogs_AppendOnly ON AuditLogs) แล้วเปิดกลับ
CREATE OR ALTER TRIGGER TR_AuditLogs_AppendOnly ON AuditLogs
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51000, 'AuditLogs is append-only', 1;
END
GO
