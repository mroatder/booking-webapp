-- เลขที่สายรวมโอที (OT-ปี-ลำดับ) ออกตอน Admin กดรวมสาย - ใช้ตารางลำดับเลขเอกสาร DocumentSequences เดียวกับเลขคำขอ VR
-- สายรวมที่สร้างไว้ก่อนมีคอลัมน์นี้ (Code ว่าง) จะได้เลขตอนถูกรวมเพิ่มครั้งถัดไป
-- รันซ้ำได้: ข้ามคอลัมน์ที่มีอยู่แล้ว
IF COL_LENGTH('ShuttleCombinedTrips', 'Code') IS NULL
    ALTER TABLE ShuttleCombinedTrips ADD Code VARCHAR(20) NULL;
GO
