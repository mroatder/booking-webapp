<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { th, enGB } from 'date-fns/locale'

// ตัวเลือกวันที่ - v-model เป็น string 'yyyy-MM-dd' (ใช้กับ backend/Date ได้ตรงๆ)
// แสดงในช่องเป็น DD/MM/YYYY (ค.ศ.) เสมอ ปฏิทินใช้ภาษาตามที่ผู้ใช้เลือก
// หมายเหตุ: @vuepic/vue-datepicker v14 ย้าย option ไปอยู่ใน formats / time-config / input-attrs
// (props แบบเก่า format / enable-time-picker / required ถูกละเลยเงียบๆ ทำให้ช่องแสดงเป็น MM/DD/YYYY, 00:00)
// ไม่เปิดให้พิมพ์วันที่เอง (text-input): ไลบรารีส่งข้อความทีละตัวอักษรและช่องเสียโฟกัสทุกครั้งที่พิมพ์ - ใช้ min/max จำกัดช่วงแทน
const props = defineProps({
  modelValue: { type: String, default: '' },
  required: { type: Boolean, default: false },
  placeholder: { type: String, default: 'DD/MM/YYYY' },
  // จำกัดช่วงที่เลือกได้ - Date หรือ 'yyyy-MM-dd' (วันที่นอกช่วงจะกดไม่ได้)
  minDate: { type: [Date, String], default: undefined },
  maxDate: { type: [Date, String], default: undefined },
})
const emit = defineEmits(['update:modelValue'])
const { locale } = useI18n()

const toDate = (v) => {
  if (!v) return undefined
  if (v instanceof Date) return v
  const [y, m, d] = String(v).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : undefined
}

const value = computed({
  get: () => props.modelValue || null,
  set: (v) => {
    if (!v) {
      emit('update:modelValue', '')
    } else if (v instanceof Date) {
      const y = v.getFullYear()
      const m = String(v.getMonth() + 1).padStart(2, '0')
      const d = String(v.getDate()).padStart(2, '0')
      emit('update:modelValue', `${y}-${m}-${d}`)
    } else {
      emit('update:modelValue', String(v))
    }
  },
})

// ต้องเป็น string format ไม่ใช่ function: ถ้า formats.input เป็น function ไลบรารีจะใช้มันแปลงค่า model ด้วย
// (ได้ 'DD/MM/YYYY' ไปเก็บในฟอร์มแทน 'yyyy-MM-dd' ทำให้ช่องวันที่ว่างหลังเลือก)
const formats = { input: 'dd/MM/yyyy', preview: 'dd/MM/yyyy' }
const timeConfig = { enableTimePicker: false }
const inputAttrs = computed(() => ({ required: props.required }))
const pickerLocale = computed(() => (locale.value === 'th' ? th : enGB))
</script>

<template>
  <VueDatePicker
    v-model="value"
    auto-apply
    model-type="yyyy-MM-dd"
    :time-config="timeConfig"
    :formats="formats"
    :locale="pickerLocale"
    :placeholder="placeholder"
    :input-attrs="inputAttrs"
    :min-date="toDate(minDate)"
    :max-date="toDate(maxDate)"
  />
</template>
