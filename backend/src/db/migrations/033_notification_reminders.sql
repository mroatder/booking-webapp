-- ธง "ส่งอีเมลเตือนแล้ว" กันส่งซ้ำ (ส่งครั้งเดียวต่อรายการ)
-- ApprovalReminderSentAt: เตือนผู้อนุมัติที่ยังไม่ตัดสินคำขอรถนอกเกิน 24 ชม. (ล้างทุกครั้งที่ผู้ขอแก้ไขแล้วส่งอนุมัติใหม่)
-- TripReminderSentAt: เตือนผู้ขอ/ผู้ร่วมเดินทางก่อนวันเดินทางของรถที่จัดแล้ว
IF COL_LENGTH('VehicleRequests', 'ApprovalReminderSentAt') IS NULL
    ALTER TABLE VehicleRequests ADD ApprovalReminderSentAt DATETIME2 NULL;
GO
IF COL_LENGTH('VehicleRequests', 'TripReminderSentAt') IS NULL
    ALTER TABLE VehicleRequests ADD TripReminderSentAt DATETIME2 NULL;
GO
-- DeadlineReminderSentAt: เตือนคนที่ยังไม่ลงชื่อเมื่อใกล้ปิดรับลงชื่อเดินทางกลุ่ม
IF COL_LENGTH('EventTrips', 'DeadlineReminderSentAt') IS NULL
    ALTER TABLE EventTrips ADD DeadlineReminderSentAt DATETIME2 NULL;
GO
