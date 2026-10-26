import express from 'express'
import { getPool } from '../../db/pool.js'
import { requireAuth } from '../../middleware/auth.js'
import * as alertsRepo from './repository.js'

export const alertsRouter = express.Router()

/**
 * จำนวนงานที่รอฉันดำเนินการ (ใช้กับกระดิ่งแจ้งเตือน + ตัวเลขบนเมนูย่อย)
 * - approvals: คำขอรถที่เลือกให้ฉันเป็นผู้อนุมัติและยังไม่ตัดสิน
 * - vehicleManage: (Admin) คำขอรถที่รอจัดรถ/คนขับ
 */
alertsRouter.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const isAdmin = req.user.role === 'Admin'
    const [approvals, vehicleManage] = await Promise.all([
      alertsRepo.countPendingApprovals(pool, req.user.id),
      isAdmin ? alertsRepo.countPendingAssignments(pool) : 0,
    ])
    res.json({ approvals, vehicleManage })
  } catch (err) {
    next(err)
  }
})
