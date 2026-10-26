-- เลขที่เอกสารคำขอรถที่คนอ่านง่าย: VR-ปี ค.ศ.-ลำดับ 4 หลัก (เช่น VR-2026-0001) รันใหม่ทุกปี เรียงต่อกันไม่มีช่องว่าง
-- (dev 2026-09-30) - RequestID (IDENTITY) ยังเป็นตัวอ้างอิงภายในเหมือนเดิม เพราะ IDENTITY กระโดดได้ ใช้นับไม่ได้
-- ปีนับตามเวลาไทย (UTC+7) ของตอนที่ส่งคำขอ

CREATE TABLE DocumentSequences (
    Prefix      VARCHAR(10) NOT NULL,
    [Year]      INT         NOT NULL,
    LastNumber  INT         NOT NULL,

    CONSTRAINT PK_DocumentSequences PRIMARY KEY (Prefix, [Year])
);
GO

ALTER TABLE VehicleRequests ADD RequestNo VARCHAR(20) NULL;
GO

-- ออกเลขย้อนหลังให้คำขอเดิม เรียงตามเวลาที่ส่งคำขอในแต่ละปี
WITH numbered AS (
    SELECT RequestID,
           YEAR(DATEADD(HOUR, 7, CreatedAt)) AS Yr,
           ROW_NUMBER() OVER (PARTITION BY YEAR(DATEADD(HOUR, 7, CreatedAt)) ORDER BY CreatedAt, RequestID) AS N
    FROM VehicleRequests
)
UPDATE vr
SET RequestNo = CONCAT('VR-', n.Yr, '-', FORMAT(n.N, '0000'))
FROM VehicleRequests vr
JOIN numbered n ON n.RequestID = vr.RequestID;
GO

INSERT INTO DocumentSequences (Prefix, [Year], LastNumber)
SELECT 'VR', YEAR(DATEADD(HOUR, 7, CreatedAt)), COUNT(*)
FROM VehicleRequests
GROUP BY YEAR(DATEADD(HOUR, 7, CreatedAt));
GO

ALTER TABLE VehicleRequests ALTER COLUMN RequestNo VARCHAR(20) NOT NULL;
GO

CREATE UNIQUE INDEX UX_VehicleRequests_RequestNo ON VehicleRequests (RequestNo);
GO
