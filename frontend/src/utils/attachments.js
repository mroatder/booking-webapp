// ไฟล์แนบของคำขอรถเก่า (ก่อน 2026-10-05) - ฟอร์มไม่มีช่องแนบแล้ว เหลือแค่เปิดดูไฟล์เดิม
export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function attachmentUrl(requestId, attachmentId) {
  return `/api/vehicle-requests/${requestId}/attachments/${attachmentId}`
}
