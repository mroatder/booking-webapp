import { ApiError } from '@/api/client'

/**
 * ข้อความบอกเหตุผลที่ลบคนขับ/รถ/ผู้ให้บริการไม่ได้ จาก details ของ FLEET_ITEM_IN_USE
 * (usage: requests, regularOf[{plate, route}], routes[], drivers, vehicles, routeCount)
 * error อื่น → ข้อความ error ปกติ
 */
export function deleteErrorMessage(t, err, name) {
  if (!(err instanceof ApiError) || err.errorCode !== 'FLEET_ITEM_IN_USE') {
    return t(`errors.${err instanceof ApiError ? err.errorCode : 'GENERIC'}`)
  }
  const u = err.details ?? {}
  const reasons = []
  if (u.requests) reasons.push(t('fleet.usage.requests', { n: u.requests }))
  if (u.regularOf?.length) {
    reasons.push(t('fleet.usage.regularOf', { list: u.regularOf.map((v) => (v.route ? `${v.plate} (${v.route})` : v.plate)).join(', ') }))
  }
  if (u.routes?.length) reasons.push(t('fleet.usage.inRoute', { list: u.routes.join(', ') }))
  if (u.drivers) reasons.push(t('fleet.usage.drivers', { n: u.drivers }))
  if (u.vehicles) reasons.push(t('fleet.usage.vehicles', { n: u.vehicles }))
  if (u.passengers) reasons.push(t('fleet.usage.passengers', { n: u.passengers }))
  if (u.routeCount) reasons.push(t('fleet.usage.routes', { n: u.routeCount }))
  return t('fleet.usage.cannotDelete', { name, reasons: reasons.join(', ') || t('fleet.usage.linked') })
}
