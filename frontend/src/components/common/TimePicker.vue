<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { th, enGB } from 'date-fns/locale'

// ตัวเลือกเวลาแบบ 24 ชั่วโมงเสมอ (ไม่เปิดพิมพ์เอง - เหตุผลเดียวกับ DatePicker)
// v-model เป็น string 'HH:mm'
// หมายเหตุ: @vuepic/vue-datepicker v14 - option อยู่ใน time-config / formats / input-attrs / text-input
const props = defineProps({
  modelValue: { type: String, default: '' },
  required: { type: Boolean, default: false },
  placeholder: { type: String, default: '00:00' },
})
const emit = defineEmits(['update:modelValue'])
const { locale } = useI18n()

const pad = (n) => String(n ?? 0).padStart(2, '0')

const value = computed({
  get: () => {
    if (!props.modelValue) return null
    const [h, m] = String(props.modelValue).split(':')
    return { hours: Number(h) || 0, minutes: Number(m) || 0 }
  },
  set: (v) => {
    if (!v) {
      emit('update:modelValue', '')
      return
    }
    emit('update:modelValue', `${pad(v.hours)}:${pad(v.minutes)}`)
  },
})

function formatTime(v) {
  if (!v) return ''
  if (typeof v === 'object' && 'hours' in v) return `${pad(v.hours)}:${pad(v.minutes)}`
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`
  return String(v)
}

const formats = { input: formatTime, preview: formatTime }
const timeConfig = { is24: true }
const inputAttrs = computed(() => ({ required: props.required }))
const pickerLocale = computed(() => (locale.value === 'th' ? th : enGB))
</script>

<template>
  <VueDatePicker
    v-model="value"
    time-picker
    auto-apply
    :time-config="timeConfig"
    :formats="formats"
    :locale="pickerLocale"
    :placeholder="placeholder"
    :input-attrs="inputAttrs"
  />
</template>
