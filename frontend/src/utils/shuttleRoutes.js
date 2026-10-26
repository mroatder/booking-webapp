// รถโอที: คำขอไม่ได้เก็บประเภทเที่ยวไว้ตรงๆ
// - สาย/จุดขึ้นรถของแต่ละคนเป็นสำเนา ณ ตอนส่งคำขอ (p.routeId / p.routeName / p.pickupStop ในผู้โดยสารของคำขอ)
//   ย้ายสายภายหลังไม่ทำให้คำขอเก่าเปลี่ยน - ห้ามไปอ่านจากข้อมูลผู้โดยสารรถรับส่งปัจจุบัน (GET /api/passengers)
// - ประเภทเที่ยว (เช้า/เย็น/วันหยุด) ถูกเขียนลงจุดรับ/ปลายทางตอนส่งคำขอ (ดู VehicleRequestForm)

/** สายที่ต้องวิ่ง เรียงจากคนมากสุด + จำนวนพนักงานที่ไม่มีสายประจำ */
export function summarizeShuttleRoutes(passengers) {
  const counts = new Map()
  let noRoute = 0
  for (const p of passengers ?? []) {
    if (!p.routeName) {
      noRoute++
      continue
    }
    counts.set(p.routeName, (counts.get(p.routeName) ?? 0) + 1)
  }
  const routes = [...counts].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
  return { routes, noRoute }
}

/** Morning = รับมาบริษัท, Evening = ส่งกลับบ้าน, Holiday = ไป-กลับ */
export function otTypeOf(request) {
  if (request.destination === 'บริษัท') return 'Morning'
  if (request.pickupLocation === 'บริษัท') return 'Evening'
  return 'Holiday'
}

const pad = (n) => String(n).padStart(2, '0')

/**
 * สถานะจัดรถของเที่ยว (สายเดียวอาจมาจากหลายคำขอที่จัดรถแยกกัน)
 * tone: done = ทุกคำขอจัดคนขับคนเดียวกันแล้ว, partial = จัดแล้วบางคำขอ/คนละคัน, pending = ยังไม่จัดเลย
 */
export function tripAssignment(trip) {
  const assigned = trip.requests.filter((r) => r.driver)
  const drivers = [
    ...new Set(assigned.map((r) => [r.driver.name, r.driver.licensePlate].filter(Boolean).join(' '))),
  ]
  let tone = 'partial'
  if (assigned.length === 0) tone = 'pending'
  else if (assigned.length === trip.requests.length && drivers.length === 1) tone = 'done'
  return { tone, done: assigned.length, total: trip.requests.length, drivers }
}

/**
 * รวมคำขอโอทีที่ต่างคนต่างส่ง ให้เป็นเที่ยวรถ: เวลาออกเดียวกัน + ประเภทเที่ยว + สายเดียวกัน
 * ผู้โดยสารแต่ละคนไปอยู่ในสายของตัวเอง (คำขอเดียวอาจแตกไปหลายสาย) - คนไม่มีสายประจำรวมไว้ที่ routeName = null
 * เรียงเที่ยวตามเวลา แล้วเรียงผู้โดยสารตามลำดับจุดจอดของสาย
 */
export function groupShuttleTrips(requests, shuttleRoutes) {
  const groups = new Map()
  for (const request of requests) {
    if (request.requestType !== 'Shuttle') continue
    const depart = new Date(request.departTime)
    const otType = otTypeOf(request)
    // คำขอที่ Admin รวมเป็นสายรวม: ทุกคนในคำขอไปเที่ยวเดียวกัน ไม่แยกตามสายประจำ (จุดขึ้น/ลงยังเป็นของแต่ละคน)
    const combinedId = request.combinedTripId ?? null
    for (const p of request.passengers ?? []) {
      const routeId = combinedId ? null : (p.routeId ?? null)
      const key = combinedId ? `combined|${combinedId}` : `${depart.getTime()}|${otType}|${routeId}`
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          departTime: request.departTime,
          returnTime: request.returnTime,
          otType,
          routeId,
          routeName: combinedId ? null : (p.routeName ?? null),
          combinedTripId: combinedId,
          combinedTripCode: request.combinedTripCode ?? null,
          isCombined: Boolean(combinedId),
          dateKey: `${depart.getFullYear()}-${pad(depart.getMonth() + 1)}-${pad(depart.getDate())}`,
          riders: [],
          requests: new Map(),
        })
      }
      const group = groups.get(key)
      group.riders.push({ ...p, pickupStop: p.pickupStop ?? null, homeRouteId: p.routeId ?? null, homeRouteName: p.routeName ?? null, request })
      group.requests.set(request.id, request)
    }
  }

  const stopIndex = (routeId, stop) => {
    const route = shuttleRoutes.find((r) => r.id === routeId)
    if (!route || !stop) return Number.MAX_SAFE_INTEGER
    const names = [route.origin, ...(route.stops ?? []).map((s) => (typeof s === 'string' ? s : s.name)), route.destination]
    const i = names.indexOf(stop)
    return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i
  }

  return [...groups.values()]
    .map((g) => {
      // สายรวม: เรียงตามสายประจำของแต่ละคน แล้วตามลำดับจุดจอดของสายนั้น (บริษัทรถจัดเส้นทางเอง)
      const riders = g.riders.sort(
        (a, b) =>
          (g.isCombined ? (a.homeRouteName ?? '￿').localeCompare(b.homeRouteName ?? '￿', 'th') : 0) ||
          stopIndex(g.isCombined ? a.homeRouteId : g.routeId, a.pickupStop) - stopIndex(g.isCombined ? b.homeRouteId : g.routeId, b.pickupStop) ||
          a.fullName.localeCompare(b.fullName, 'th'),
      )
      // ชื่อสายรวม = สายประจำของคนในเที่ยว เช่น "A + B" (ไม่มีสายประจำ = ไม่นับ)
      const memberRoutes = g.isCombined ? [...new Set(riders.map((r) => r.homeRouteName).filter(Boolean))] : []
      return {
        ...g,
        routeName: g.isCombined ? (memberRoutes.join(' + ') || null) : g.routeName,
        requests: [...g.requests.values()],
        riders,
      }
    })
    .sort(
      (a, b) =>
        new Date(a.departTime) - new Date(b.departTime) ||
        (a.routeName === null) - (b.routeName === null) ||
        (a.routeName ?? '').localeCompare(b.routeName ?? '', 'th'),
    )
}
