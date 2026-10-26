import { describeRequest, isMutating } from '../modules/audit/actions.js'
import { recordAudit, loadBefore } from '../modules/audit/service.js'

/**
 * บันทึก audit log อัตโนมัติสำหรับทุกคำขอที่แก้ข้อมูล (POST/PUT/PATCH/DELETE) ที่สำเร็จ
 *  - ผู้กระทำ: req.user (ตั้งโดย requireAuth ของแต่ละ route) / จอ tablet / ระบบ
 *  - เก็บ "ค่าก่อนแก้" ของ entity ที่มี loader + body ที่ส่งมา (ตัดข้อมูลลับแล้ว)
 *  - การเขียน log ล้มเหลวต้องไม่กระทบคำขอจริง (best-effort)
 * ล็อกอินล้มเหลวบันทึกเป็น auth.loginFailed (ไม่เก็บรหัสผ่าน)
 */
export function createAuditTrail({ record = recordAudit, before = loadBefore } = {}) {
  return async function auditTrail(req, res, next) {
    if (!isMutating(req.method)) return next()

    const info = describeRequest(req.method, req.originalUrl)
    const isLogin = info.action === 'auth.login'

    let beforeSnapshot
    if (info.entityId && !isLogin) beforeSnapshot = await before(info.entityType, info.entityId)

    res.on('finish', () => {
      const ok = res.statusCode >= 200 && res.statusCode < 400
      if (!ok && !(isLogin && (res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 429))) return

      const loginName = typeof req.body?.username === 'string' ? req.body.username.slice(0, 100) : null
      const isTablet = info.template.startsWith('/tablet/display/')
      const userId = req.user?.id ?? res.locals.auditUserId ?? null

      record({
        userId,
        actor: userId ? null : isLogin ? loginName : isTablet ? 'tablet' : 'anonymous',
        action: isLogin && !ok ? (res.statusCode === 429 ? 'auth.loginBlocked' : 'auth.loginFailed') : info.action,
        entityType: info.entityType,
        entityId: info.entityId,
        method: req.method,
        path: info.template,
        statusCode: res.statusCode,
        ip: req.ip ?? null,
        // เข้าสู่ระบบ: ไม่เก็บ body (มีรหัสผ่าน) - username อยู่ใน actor แล้ว
        before: beforeSnapshot,
        body: isLogin ? undefined : req.body,
        query: req.query,
        files: req.files ?? (req.file ? [req.file] : undefined),
      })
    })

    next()
  }
}

export const auditTrail = createAuditTrail()
