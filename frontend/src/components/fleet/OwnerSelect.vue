<script setup>
import { useI18n } from 'vue-i18n'
import { useFleetStore } from '@/stores/fleet'

// เลือกเจ้าของคนขับ/รถ: '' = บริษัทเรา, id = บริษัทรถเช่า (เรียกรถออนไลน์ไม่มีรายชื่อคนขับ/รถ จึงไม่อยู่ในตัวเลือก)
const model = defineModel({ type: [String, Number], default: '' })
defineProps({ id: { type: String, required: true } })
const { t } = useI18n()
const fleet = useFleetStore()
</script>

<template>
  <select
    :id="id"
    v-model="model"
    class="input"
  >
    <option value="">{{ t('fleet.ownerCompany') }}</option>
    <option v-for="p in fleet.rentalProviders" :key="p.id" :value="p.id">{{ t('fleet.ownerRental', { name: p.name }) }}</option>
  </select>
</template>
