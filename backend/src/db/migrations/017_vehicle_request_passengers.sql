CREATE TABLE VehicleRequestPassengers (
    RequestID INT NOT NULL,
    UserID INT NOT NULL,
    
    CONSTRAINT PK_VehicleRequestPassengers PRIMARY KEY (RequestID, UserID),
    CONSTRAINT FK_VRP_Request FOREIGN KEY (RequestID) REFERENCES VehicleRequests(RequestID) ON DELETE CASCADE,
    CONSTRAINT FK_VRP_User FOREIGN KEY (UserID) REFERENCES Users(UserID)
);
GO
