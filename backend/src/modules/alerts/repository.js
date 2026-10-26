import { sql } from '../../db/pool.js'

export async function countPendingApprovals(pool, approverId) {
  const result = await pool
    .request()
    .input('approverId', sql.Int, approverId)
    .query(
      `SELECT COUNT(*) AS n FROM VehicleRequests
       WHERE ApproverUserID = @approverId AND ApprovalStatus = 'Pending' AND Status = 'Pending'`,
    )
  return result.recordset[0].n
}

// รอจัดรถ = ยังไม่ Assigned และไม่ได้ค้างขั้นอนุมัติ (ถูกปฏิเสธไม่นับ)
export async function countPendingAssignments(pool) {
  const result = await pool
    .request()
    .query(
      `SELECT COUNT(*) AS n FROM VehicleRequests
       WHERE Status = 'Pending' AND ApprovalStatus IN ('NotRequired', 'Approved')`,
    )
  return result.recordset[0].n
}
