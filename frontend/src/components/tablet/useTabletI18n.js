import { useI18n } from 'vue-i18n'
import en from '@/locales/en.json'

/**
 * จอ tablet หน้าห้องแสดงภาษาอังกฤษเสมอ (dev ยืนยัน 2026-09-29) - ไม่ขึ้นกับภาษาที่เบราว์เซอร์เครื่องนั้นเคยเลือก
 * ใช้ i18n scope เฉพาะ component (ไม่แตะภาษาของทั้งแอป/ค่าใน localStorage) - วันที่/เวลาเป็น en-GB (DD/MM/YYYY, 24 ชม.)
 */
export function useTabletI18n() {
  return useI18n({ useScope: 'local', inheritLocale: false, locale: 'en', messages: { en } })
}
