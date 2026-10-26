-- เพิ่มคอลัมน์ RequestType เพื่อแยกระหว่าง "รถรับส่งพนักงาน" กับ "รถไปงานนอก"
ALTER TABLE VehicleRequests 
ADD RequestType VARCHAR(20) NOT NULL CONSTRAINT DF_VehicleRequests_Type DEFAULT 'BusinessTrip';
GO

ALTER TABLE VehicleRequests 
ADD CONSTRAINT CK_VehicleRequests_Type CHECK (RequestType IN ('BusinessTrip', 'Shuttle'));
GO
