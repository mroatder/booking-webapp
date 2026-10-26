<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// คำขอที่ยังไม่จัดรถ (Pending) แสดงสถานะการอนุมัติแทน: รออนุมัติ / ไม่อนุมัติ (dev+HR 2026-10-05)
const props = defineProps({
  status: { type: String, required: true },
  approvalStatus: { type: String, default: 'NotRequired' },
})
const { t } = useI18n()

const classes = {
  Pending: 'bg-amber-100 text-amber-800',
  Assigned: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-slate-100 text-slate-600',
  AwaitingApproval: 'bg-sky-100 text-sky-800',
  Rejected: 'bg-red-100 text-red-800',
}

const key = computed(() => {
  if (props.status !== 'Pending') return props.status
  if (props.approvalStatus === 'Pending') return 'AwaitingApproval'
  if (props.approvalStatus === 'Rejected') return 'Rejected'
  return 'Pending'
})
</script>

<template>
  <span :class="['inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', classes[key]]">
    {{ t(`vehicleBooking.status${key}`) }}
  </span>
</template>
