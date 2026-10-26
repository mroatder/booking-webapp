import { env } from '../../config/env.js'

/**
 * แม่แบบอีเมลสไตล์ Superworks Clean & Professional (ขยายขนาดตัวหนังสือเต็มสเกล 2026-10-02)
 * 
 * การปรับปรุงตามคำขอผู้ใช้:
 * - ขยายตัวหนังสือภาษาไทยทั้งหมดให้ใหญ่ ชัดเจน อ่านง่าย ไม่เล็กเกินไป (Header 24px, Title 28px, Greeting 19px, Body 17px, Table 18px)
 * - รักษาระยะห่างบรรทัดกระชับ ไม่ห่างเกินไป
 * - ใช้ฟอนต์ภาษาไทยมาตรฐาน (Sarabun / Prompt / Leelawadee UI / Tahoma)
 */

const TONES = {
  info: { fg: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  success: { fg: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  warning: { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  danger: { fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  neutral: { fg: '#334155', bg: '#f1f5f9', border: '#cbd5e1' },
}

const INK = '#0f172a'         // Dark Ink / Slate 900
const TEXT_BODY = '#111827'   // Dark Slate (คมชัดสูง)
const MUTED = '#475569'       // Slate 600
const LINE = '#e2e8f0'        // Slate 200
const BG_MAIN = '#f3f4f6'     // Light Grey Page Background
const FOOTER_BG = '#181e2e'   // Dark Slate Navy Footer

const FONT = `'Sarabun', 'Prompt', 'Leelawadee UI', Leelawadee, 'Segoe UI', Tahoma, Thonburi, Arial, sans-serif`

const CHROME = {
  th: {
    system: 'ระบบจองห้องประชุมและรถ',
    subSystem: 'Room & Vehicle Booking',
    footer: 'อีเมลฉบับนี้ส่งโดยอัตโนมัติจากระบบ กรุณาอย่าตอบกลับ หากมีข้อสงสัยโปรดติดต่อผู้ดูแลระบบ',
    textFooter: '- ระบบจองห้องประชุมและรถ (อีเมลอัตโนมัติ กรุณาอย่าตอบกลับ)',
    status: 'สถานะ',
    copyright: '© 2026 ระบบจองห้องประชุมและรถ สงวนลิขสิทธิ์ทั้งหมด',
  },
  en: {
    system: 'Room & Vehicle Booking System',
    subSystem: 'Room & Vehicle Booking',
    footer: 'Please do not reply to this email. You are receiving this email because of an activity in the system.',
    textFooter: '- Room & Vehicle Booking System (automated message, please do not reply)',
    status: 'Status',
    copyright: 'Copyright © 2026 Room & Vehicle Booking System. All rights reserved.',
  },
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function appUrl(path) {
  if (!env.appBaseUrl) return null
  // from=email: ให้หน้าเว็บรู้ว่าเปิดจากลิงก์อีเมล → หลัง login ต้องไปหน้านี้เสมอ (ไม่ไปหน้าแรกแบบ session หมดอายุ)
  const sep = path.includes('?') ? '&' : '?'
  return `${env.appBaseUrl.replace(/\/+$/, '')}${path}${sep}from=email`
}

const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== ''
const multiline = (v) => escapeHtml(v).replace(/\n/g, '<br>')

export function renderEmail({
  lang = 'th',
  subject,
  label,
  tone = 'info',
  status,
  title,
  greeting,
  paragraphs = [],
  summary = [],
  sections,
  rows = [],
  action,
  note,
}) {
  const t = TONES[tone] ?? TONES.info
  const c = CHROME[lang] ?? CHROME.th
  const f = `font-family:${FONT};`

  const groups = (sections ?? [{ rows }])
    .map((s) => ({ title: s.title, rows: s.rows.filter(([, v]) => hasValue(v)) }))
    .filter((s) => s.rows.length > 0)

  const summaryCells = summary.filter(([, v]) => hasValue(v))

  // กล่องสรุป Hero Summary Box (ขยายตัวหนังสือ 15px - 19px)
  const summaryHtml =
    summaryCells.length || status
      ? `<tr><td style="padding:0 44px 12px 44px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid ${LINE};border-radius:8px;">
        <tr>
          ${summaryCells
            .map(
              ([k, v], i) => `<td valign="top" style="padding:14px 18px;${i ? `border-left:1px solid ${LINE};` : ''}">
            <div style="${f}font-size:15px;font-weight:600;color:${MUTED};">${escapeHtml(k)}</div>
            <div style="${f}font-size:19px;font-weight:700;color:${INK};margin-top:4px;line-height:1.4;">${multiline(v)}</div>
          </td>`,
            )
            .join('')}
          ${
            status
              ? `<td valign="top" align="right" style="padding:14px 18px;${summaryCells.length ? `border-left:1px solid ${LINE};` : ''}">
            <div style="${f}font-size:15px;font-weight:600;color:${MUTED};margin-bottom:6px;">${c.status}</div>
            <div><span style="${f}display:inline-block;font-size:16px;font-weight:700;color:${t.fg};background:${t.bg};border:1px solid ${t.border};padding:5px 16px;border-radius:20px;">${escapeHtml(status)}</span></div>
          </td>`
              : ''
          }
        </tr>
      </table>
    </td></tr>`
      : ''

  // หมวดหมู่รายละเอียดข้อมูล (ขยายฟอนต์ตารางเป็น 16px / 18px)
  const sectionsHtml = groups
    .map(
      (g) => `<tr><td style="padding:18px 44px 0 44px;">
      ${
        g.title
          ? `<div style="${f}font-size:18px;font-weight:700;color:${INK};padding-left:10px;border-left:4px solid ${t.fg};margin-bottom:10px;">${escapeHtml(g.title)}</div>`
          : `<div style="border-bottom:1px solid ${LINE};margin-bottom:10px;"></div>`
      }
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${LINE};border-radius:8px;border-collapse:separate;border-spacing:0;">
        ${g.rows
          .map(
            ([k, v], idx) => `<tr>
          <td valign="top" style="${f}padding:12px 16px;${idx < g.rows.length - 1 ? `border-bottom:1px solid ${LINE};` : ''}font-size:16px;font-weight:600;color:${MUTED};width:32%;background:#f8fafc;">${escapeHtml(k)}</td>
          <td valign="top" style="${f}padding:12px 16px;${idx < g.rows.length - 1 ? `border-bottom:1px solid ${LINE};` : ''}font-size:18px;font-weight:700;color:${INK};line-height:1.45;">${multiline(v)}</td>
        </tr>`,
          )
          .join('')}
      </table>
    </td></tr>`,
    )
    .join('')

  // ปุ่มกด Action CTA (สีกกตามโทนสถานะ)
  const button = action?.url
    ? `<tr><td style="padding:24px 44px 0 44px;" align="center">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:${t.fg};border-radius:6px;box-shadow:0 3px 8px rgba(0,0,0,0.15);">
          <a href="${escapeHtml(action.url)}" style="${f}display:inline-block;font-size:18px;font-weight:700;color:#ffffff;text-decoration:none;padding:14px 32px;letter-spacing:0.2px;">${escapeHtml(action.label)}</a>
        </td>
      </tr></table>
    </td></tr>`
    : ''

  // หมายเหตุ / Note Box (สีกกตามโทนสถานะ)
  const noteHtml = note
    ? `<tr><td style="padding:18px 44px 0 44px;">
      <div style="${f}font-size:16px;line-height:1.5;color:#1f2937;background:${t.bg};border:1px solid ${t.border};border-left:4px solid ${t.fg};border-radius:6px;padding:14px 18px;">
        <strong style="color:${INK};">หมายเหตุ / Note:</strong> ${escapeHtml(note)}
      </div>
    </td></tr>`
    : ''

  const html = `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(subject)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=Sarabun:wght@400;500;600;700;800&display=swap');
    body, table, td, a { font-family: 'Sarabun', 'Prompt', 'Leelawadee UI', Leelawadee, 'Segoe UI', Tahoma, sans-serif !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BG_MAIN};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(paragraphs[0] ?? title)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_MAIN};padding:30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card Window -->
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid ${LINE};border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.05);">
          
          <!-- Top Header Bar with Logo -->
          <tr>
            <td align="center" style="padding:18px 20px;background:#f8fafc;border-bottom:1px solid ${LINE};">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <!-- Logo Graphic -->
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:14px;height:14px;background:#2563eb;border-radius:50%;display:inline-block;margin-right:2px;"></td>
                        <td style="width:14px;height:14px;background:#f59e0b;border-radius:50%;display:inline-block;margin-right:2px;"></td>
                        <td style="width:14px;height:14px;background:#ef4444;border-radius:50%;display:inline-block;"></td>
                      </tr>
                    </table>
                  </td>
                  <td style="${f}font-size:24px;font-weight:800;color:${INK};letter-spacing:-0.4px;vertical-align:middle;">
                    ${escapeHtml(c.system)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Section (Integrated Category Label & Title) -->
          <tr>
            <td style="padding:22px 44px 14px 44px;">
              ${label ? `<div style="margin-bottom:10px;"><span style="${f}font-size:15px;font-weight:700;color:${t.fg};background:${t.bg};border:1px solid ${t.border};padding:4px 12px;border-radius:6px;display:inline-block;">${escapeHtml(label)}</span></div>` : ''}
              <div style="${f}font-size:28px;line-height:1.35;font-weight:800;color:${INK};letter-spacing:-0.4px;">${escapeHtml(title)}</div>
              ${greeting ? `<div style="${f}font-size:19px;line-height:1.4;font-weight:700;color:${INK};margin-top:14px;">${escapeHtml(greeting)}</div>` : ''}
              ${paragraphs.map((p) => `<div style="${f}font-size:17px;line-height:1.55;color:${TEXT_BODY};margin-top:6px;">${escapeHtml(p)}</div>`).join('')}
            </td>
          </tr>

          ${summaryHtml}
          ${sectionsHtml}
          ${button}
          ${noteHtml}

          <!-- Spacing -->
          <tr><td style="padding:28px 0 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- Dark Navy Footer -->
          <tr>
            <td style="background:${FOOTER_BG};padding:24px 36px;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <!-- Footer Disclaimer Message -->
                <tr>
                  <td align="center" style="${f}font-size:15px;line-height:1.5;color:#e2e8f0;font-style:italic;padding-bottom:6px;">
                    ${escapeHtml(c.footer)}
                  </td>
                </tr>

                <!-- Copyright Line -->
                <tr>
                  <td align="center" style="${f}font-size:13px;color:#94a3b8;">
                    ${escapeHtml(c.copyright)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    `[${label}] ${title}`,
    '',
    greeting,
    ...paragraphs,
    '',
    ...summaryCells.map(([k, v]) => `${k}: ${v}`),
    status ? `${c.status}: ${status}` : undefined,
    ...groups.flatMap((g) => [g.title ? `\n${g.title}` : '', ...g.rows.map(([k, v]) => `${k}: ${String(v).replace(/\n/g, ', ')}`)]),
    action?.url ? `\n${action.label}: ${action.url}` : '',
    note ? `\n${note}` : '',
    '',
    c.textFooter,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return { subject: `[${c.system}] ${subject}`, html, text }
}





