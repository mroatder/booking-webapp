-- รองรับสถานะ Online/Offline ของ tablet หน้าห้อง: อัปเดตทุกครั้งที่ tablet โหลด/รีเฟรชหน้าแสดงผล
ALTER TABLE Rooms ADD LastSeenAt DATETIME2 NULL;
GO
