/**
 * PDF แบบฟอร์มการขอใช้รถ (W-HR-009 Annex B R0) จากคำขอรถไปงานนอก - Admin ส่งออกให้บริษัทรถ (dev+HR 2026-10-05)
 * เปิดหน้าต่างใหม่ที่มีแค่แบบฟอร์ม แล้วสั่งพิมพ์ → ผู้ใช้เลือก "บันทึกเป็น PDF" (ตัวอักษรไทยถูกต้องเพราะใช้ฟอนต์ของเครื่อง)
 * ช่อง Approved by ใส่รูปลายเซ็น/ตราที่ผู้อนุมัติอัปโหลดไว้ + ชื่อ + เวลาที่อนุมัติในระบบ
 */
import { trimmedSignatureDataUrl } from '@/utils/signatureImage'

const pad = (n) => String(n).padStart(2, '0')
const dmy = (d) => (d ? `${pad(new Date(d).getDate())}/${pad(new Date(d).getMonth() + 1)}/${new Date(d).getFullYear()}` : '')
const hm = (d) => (d ? `${pad(new Date(d).getHours())}.${pad(new Date(d).getMinutes())}` : '')

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ลายเซ็นของผู้อนุมัติ ณ ตอนอนุมัติคำขอนี้ (ไม่ใช่ลายเซ็นปัจจุบันของผู้ใช้)
async function signatureDataUrl(requestId) {
  try {
    const res = await fetch(`/api/vehicle-requests/${requestId}/approver-signature`, { credentials: 'include' })
    if (!res.ok) return null
    return await trimmedSignatureDataUrl(await res.blob())
  } catch {
    return null
  }
}

function buildHtml(r, signature) {
  const oneWay = r.tripType && r.tripType !== 'RoundTrip'
  const place = r.destination ?? ''
  // คำขอเก่าก่อนมีระบบอนุมัติ: ไม่มีผู้อนุมัติในระบบ → ช่องว่างไว้ให้เซ็นมือ
  const approverName = r.approvalStatus === 'Approved' ? (r.approver?.name ?? '') : ''
  const emptyRows = Array.from({ length: 5 }, () => '<tr class="blank">' + '<td></td>'.repeat(9) + '</tr>').join('')
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>${esc(r.requestNo)} - แบบฟอร์มการขอใช้รถ</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14mm 12mm 12mm 12mm; font-family: 'Sarabun', 'TH Sarabun New', 'Leelawadee UI', Tahoma, sans-serif; color: #000; font-size: 13px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .company { font-size: 14px; }
  .ref { font-size: 11px; color: #444; text-align: right; }
  h1 { text-align: center; font-size: 17px; margin: 14px 0 2px; text-decoration: underline; }
  .sub { text-align: center; font-size: 13px; text-decoration: underline; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1.5px solid #000; padding: 6px 6px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; overflow: hidden; }
  /* ข้อความยาวเกินกำหนดจะถูกตัดด้วย … แทนที่จะดันตาราง/ล้นขอบกระดาษ */
  .clip { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; -webkit-line-clamp: 4; }
  .clip.l6 { -webkit-line-clamp: 6; }
  .one-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  tr { page-break-inside: avoid; }
  th { font-weight: 600; text-align: center; line-height: 1.35; }
  th small { display: block; font-weight: 700; font-size: 12px; }
  td { height: 34px; }
  tr.blank td { border-top: none; border-bottom: none; height: 26px; }
  tr.blank:last-child td { border-bottom: 1.5px solid #000; }
  .sign { display: flex; justify-content: space-between; margin-top: 28px; }
  .sign > div { width: 40%; text-align: center; }
  .sig-box { height: 62px; display: flex; overflow: hidden; align-items: flex-end; justify-content: center; border-bottom: 1px dotted #000; margin: 0 16px; }
  /* ขนาดคงที่: contain = ย่อ/ขยายให้พอดีกรอบโดยรักษาสัดส่วน ไม่ว่าไฟล์จะเล็กหรือใหญ่แค่ไหน */
  .sig-box img { width: 135px; height: 56px; object-fit: contain; }
  .sig-name { margin-top: 6px; }
  .sig-meta { font-size: 11px; color: #444; margin-top: 2px; }
  .foot { text-align: right; margin-top: 18px; }
  .controlled { color: #d00; font-weight: 700; font-size: 18px; margin-top: 4px; }
</style></head>
<body>
  <div class="top">
    <div class="company">บริษัท ทรีบอนด์ แมนูแฟคเจอริ่ง (ประเทศไทย) จำกัด</div>
    <div class="ref">เลขที่คำขอ ${esc(r.requestNo)}</div>
  </div>
  <h1>แบบฟอร์มการขอใช้รถ</h1>
  <div class="sub">Company Car Booking</div>
  <table>
    <colgroup>
      <col style="width:10%"><col style="width:12%"><col style="width:9%"><col style="width:11%">
      <col style="width:10%"><col style="width:15%"><col style="width:14%"><col style="width:9.5%"><col style="width:9.5%">
    </colgroup>
    <thead><tr>
      <th>ว/ด/ป<small>D/M/Y</small></th><th>ผู้ขอใช้รถ<small>Name</small></th><th>แผนก<small>Dept.</small></th>
      <th>พนักงานขับรถ<small>Driver Name</small></th><th>วันที่ขอใช้<small>Requested Date</small></th><th>สถานที่<small>Place</small></th>
      <th>เหตุผล<small>Reason</small></th><th>เวลาออก<small>Time-out</small></th><th>เวลาเข้า<small>Time-in</small></th>
    </tr></thead>
    <tbody>
      <tr>
        <td style="white-space:nowrap;font-size:11px;text-align:center">${esc(dmy(r.createdAt))}</td>
        <td><div class="clip">${esc(r.requesterName)}</div></td>
        <td style="text-align:center"><div class="clip">${esc(r.requesterDepartment)}</div></td>
        <td><div class="clip">${esc(r.driver?.name ?? '')}${r.driver?.licensePlate ? `<br><span style="font-size:11px">${esc(r.driver.licensePlate)}</span>` : ''}</div></td>
        <td style="white-space:nowrap;font-size:11px;text-align:center">${esc(dmy(r.departTime))}</td>
        <td><div class="clip l6">${esc(place)}</div></td>
        <td><div class="clip l6">${esc(r.reason)}</div></td>
        <td>${esc(hm(r.departTime))}</td>
        <td>${oneWay ? '' : esc(hm(r.returnTime))}</td>
      </tr>
      ${emptyRows}
    </tbody>
  </table>
  <div class="sign">
    <div>
      <div class="sig-box"><span class="one-line">${esc(r.requesterName)}</span></div>
      <div class="sig-name one-line">( ${esc(r.requesterName)} )</div>
      <div>Requested by</div>
      <div class="sig-meta">ส่งคำขอในระบบ ${esc(dmy(r.createdAt))} ${esc(hm(r.createdAt))}</div>
    </div>
    <div>
      <div class="sig-box">${signature ? `<img src="${signature}" alt="">` : `<span class="one-line">${esc(approverName)}</span>`}</div>
      <div class="sig-name one-line">( ${approverName ? esc(approverName) : '&nbsp;'.repeat(40)} )</div>
      <div>Approved by</div>
      <div class="sig-meta">${r.approvedAt ? `อนุมัติในระบบ ${esc(dmy(r.approvedAt))} ${esc(hm(r.approvedAt))}` : ''}</div>
    </div>
  </div>
  <div class="foot">
    <div>Annex B R0 (W-HR-009)</div>
    <div class="controlled">CONTROLLED</div>
  </div>
</body></html>`
}

/** ต้องเรียกจากการกดปุ่มโดยตรง (เปิดหน้าต่างก่อน กัน popup blocker) */
export async function openCarBookingForm(request) {
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.title = `${request.requestNo} - แบบฟอร์มการขอใช้รถ`
  win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(request.requestNo)} - แบบฟอร์มการขอใช้รถ</title></head><body style="font-family:sans-serif;padding:20px"><p>กำลังสร้างแบบฟอร์มแบบ PDF…</p></body></html>`)
  win.document.close()

  const signature =
    request.approvalStatus === 'Approved' && request.approver?.hasSignature ? await signatureDataUrl(request.id) : null
  win.document.open()
  win.document.write(buildHtml(request, signature))
  win.document.close()
  // สั่งพิมพ์จากหน้าต่างหลัก (ไม่ฝังสคริปต์ในเอกสาร) เพื่อให้ทำงานภายใต้ CSP ที่ห้าม inline script
  setTimeout(() => {
    win.focus()
    win.print()
  }, 300)
  return true
}
