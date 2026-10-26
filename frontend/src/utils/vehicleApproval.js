// การอนุมัติคำขอรถไปงานนอก (dev+HR 2026-10-05) - ตรงกับที่ backend บังคับ (APPROVAL_REQUIRED)
export const canAssign = (r) => r.approvalStatus !== 'Pending' && r.approvalStatus !== 'Rejected'

// ส่งออกแบบฟอร์ม W-HR-009 ได้เมื่อเป็นรถนอกที่ยังไม่ถูกยกเลิก และไม่ติดการอนุมัติ:
// อนุมัติแล้ว = มีลายเซ็นผู้อนุมัติ, คำขอเก่าก่อนมีระบบอนุมัติ (NotRequired) = ช่อง Approved by ว่างไว้เซ็นมือ
export const canExportForm = (r) => r.requestType === 'BusinessTrip' && r.status !== 'Cancelled' && canAssign(r)
