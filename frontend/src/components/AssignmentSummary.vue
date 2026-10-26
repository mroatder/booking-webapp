<script setup>
import { useI18n } from 'vue-i18n'

// สรุปรถ/คนขับที่จัดให้คำขอ - ใช้ทั้งหน้า Admin (compact ในตาราง) และหน้าคำขอของผู้ขอ
defineProps({
  assignment: { type: Object, required: true }, // request.driver จาก API
  compact: { type: Boolean, default: false },
})
const { t } = useI18n()
</script>

<template>
  <div v-if="compact" class="text-slate-700">
    <p class="font-medium">{{ assignment.name }}</p>
    <p class="text-xs text-slate-500">
      {{ t(`fleet.assign${assignment.kind}`) }}<template v-if="assignment.provider"> • {{ assignment.provider }}</template>
      <template v-if="assignment.phone"> • {{ assignment.phone }}</template>
    </p>
    <p class="text-xs text-slate-500">
      {{ assignment.licensePlate }}
      <template v-if="assignment.vehicle?.seatCount"> • {{ t('fleet.seatsShort', { n: assignment.vehicle.seatCount }) }}</template>
    </p>
  </div>

  <dl v-else class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-slate-700">
    <dt class="text-slate-500">{{ t('vehicleBooking.driver') }}:</dt>
    <dd>
      <span class="font-medium">{{ assignment.name }}</span>
      <span v-if="assignment.phone" class="text-slate-500"> ({{ assignment.phone }})</span>
    </dd>
    <dt class="text-slate-500">{{ t('vehicleBooking.licensePlate') }}:</dt>
    <dd>
      <span class="font-medium">{{ assignment.licensePlate }}</span>
      <span v-if="assignment.vehicle" class="text-slate-500">
        ({{ t(`vehicleBooking.type${assignment.vehicle.type}`) }}<template v-if="assignment.vehicle.seatCount">, {{ t('fleet.seatsShort', { n: assignment.vehicle.seatCount }) }}</template><template v-if="assignment.vehicle.description">, {{ assignment.vehicle.description }}</template>)
      </span>
    </dd>
    <dt class="text-slate-500">{{ t('fleet.arrangedBy') }}:</dt>
    <dd>
      {{ t(`fleet.assign${assignment.kind}`) }}<template v-if="assignment.provider"> - {{ assignment.provider }}</template>
      <span v-if="assignment.providerPhone" class="text-slate-500"> ({{ assignment.providerPhone }})</span>
    </dd>
  </dl>
</template>
