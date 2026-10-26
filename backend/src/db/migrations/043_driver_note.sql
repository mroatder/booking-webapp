-- หมายเหตุคนขับ: ใช้ระบุว่าคนขับคนนี้ขับให้ใคร (เช่น นายญี่ปุ่นคนไหน)
-- รันซ้ำได้: ข้ามคอลัมน์ที่มีอยู่แล้ว
IF COL_LENGTH('Drivers', 'Note') IS NULL
    ALTER TABLE Drivers ADD Note NVARCHAR(200) NULL;
GO
