<script setup>
// ตัวสลับในหน้า "จัดการคำขอรถ" (Admin): คำขอรถ ↔ เดินทางกลุ่ม (จัดสายรถ/Smart Route)
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()

const pillClass = (active) => [
  'seg-btn',
  active ? 'is-active' : '',
]
</script>

<template>
  <div class="seg">
    <RouterLink to="/requests/vehicles/manage" :class="pillClass(route.name === 'vehicle-request-manage')">
      {{ t('groupTrips.switchRequests') }}
    </RouterLink>
    <RouterLink to="/requests/vehicles/manage/events" :class="pillClass(route.name === 'vehicle-request-manage-events')">
      {{ t('groupTrips.switchEvents') }}
    </RouterLink>
  </div>
</template>
