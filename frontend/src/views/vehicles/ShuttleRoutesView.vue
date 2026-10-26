<script setup>
import { useI18n } from 'vue-i18n'
import ShuttleRoutesPanel from '@/components/fleet/ShuttleRoutesPanel.vue'

const { t } = useI18n()
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('fleet.section.shuttle_routes') }}</h1>
    <ShuttleRoutesPanel />
  </section>
</template>
