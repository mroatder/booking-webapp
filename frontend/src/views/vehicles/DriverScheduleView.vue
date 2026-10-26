<script setup>
import { useI18n } from 'vue-i18n'
import DriverScheduleBoard from '@/components/fleet/DriverScheduleBoard.vue'

const { t } = useI18n()
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('admin.driverSchedule') }}</h1>
    <p class="page-note mb-5">{{ t('admin.driverScheduleNote') }}</p>
    <DriverScheduleBoard />
  </section>
</template>
