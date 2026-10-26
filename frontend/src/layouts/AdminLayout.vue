<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SubNav from '@/components/common/SubNav.vue'

const { t } = useI18n()

const items = computed(() => [
  { to: '/admin/rooms', label: t('admin.rooms'), icon: 'viewGrid', names: ['admin-rooms'] },
  { to: '/admin/drivers', label: t('admin.drivers'), icon: 'truck', names: ['admin-drivers'] },
  { to: '/admin/devices', label: t('admin.devices'), icon: 'tablet', names: ['admin-devices'] },
  { to: '/admin/departments', label: t('nav.departments'), icon: 'office', names: ['admin-departments'] },
  { to: '/admin/users', label: t('admin.users'), icon: 'user', names: ['admin-users'] },
  { to: '/admin/reports', label: t('reports.title'), icon: 'chartBar', names: ['admin-reports'] },
  { to: '/admin/audit', label: t('nav.audit'), icon: 'document', names: ['admin-audit'] },
])
</script>

<template>
  <SubNav :items="items" />
  <div class="page-container">
    <RouterView />
  </div>
</template>
