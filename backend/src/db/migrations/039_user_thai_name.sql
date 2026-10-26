-- ชื่อ-สกุลภาษาไทยของพนักงาน (Admin กรอกเอง) - FullName เดิม (มาจาก AD) คงไว้เป็นชื่อหลัก/อังกฤษ
-- ใช้พิมพ์ในแบบฟอร์ม PDF ภาษาไทย (ฟอร์มขอใช้รถ W-HR-009, ใบจัดรถโอที); ว่าง = ใช้ FullName แทน
-- รันซ้ำได้: ข้ามคอลัมน์ที่มีอยู่แล้ว
IF COL_LENGTH('Users', 'FullNameTh') IS NULL
    ALTER TABLE Users ADD FullNameTh NVARCHAR(200) NULL;
GO
