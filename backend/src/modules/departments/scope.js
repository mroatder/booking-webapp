/**
 * ขอบเขตแผนกที่เลือก "พนักงานที่เดินทาง" ได้ (dev ยืนยัน 2026-09-29):
 * ทุกคนที่ไม่ใช่ Admin เลือกได้เฉพาะคนใน "แผนกหลัก" ของตัวเอง = แผนกบนสุดของสายแผนก + แผนกย่อยทั้งหมดใต้นั้น
 * (ไม่จำกัดแค่แผนกย่อย เผื่อหัวหน้างานลา คนอื่นในแผนกหลักจะได้ขอรถแทนได้)
 *
 * คำนวณใน JS จากรายการแผนกทั้งหมด (มีไม่กี่แถว) - กันวนไม่รู้จบถ้าข้อมูลแผนกเคยถูกตั้งเป็นวง
 *
 * @param {{DepartmentID:number, ParentDepartmentID:number|null}[]} departments
 * @param {number|null} departmentId แผนกของผู้ใช้
 * @returns {Set<number>} DepartmentID ทั้งหมดในแผนกหลัก (ว่างถ้าผู้ใช้ไม่มีแผนก)
 */
export function mainDepartmentScope(departments, departmentId) {
  if (!departmentId) return new Set()
  const parentOf = new Map(departments.map((d) => [d.DepartmentID, d.ParentDepartmentID]))
  if (!parentOf.has(departmentId)) return new Set()

  // เดินขึ้นไปหาแผนกบนสุด
  let root = departmentId
  const seen = new Set([root])
  while (parentOf.get(root) && !seen.has(parentOf.get(root))) {
    root = parentOf.get(root)
    seen.add(root)
  }

  // แล้วเก็บแผนกย่อยทุกชั้นใต้แผนกบนสุด
  const scope = new Set([root])
  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const d of departments) {
      if (d.ParentDepartmentID === current && !scope.has(d.DepartmentID)) {
        scope.add(d.DepartmentID)
        queue.push(d.DepartmentID)
      }
    }
  }
  return scope
}

/** true ถ้าตั้ง parentId เป็นแผนกแม่ของ id แล้วจะเกิดวง (parentId คือ id เองหรือเป็นแผนกย่อยของ id) */
export function wouldCreateCycle(departments, id, parentId) {
  const parentOf = new Map(departments.map((d) => [d.DepartmentID, d.ParentDepartmentID]))
  const seen = new Set()
  for (let cur = parentId; cur; cur = parentOf.get(cur)) {
    if (cur === id) return true
    if (seen.has(cur)) return false
    seen.add(cur)
  }
  return false
}
