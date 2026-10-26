<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAlertsStore } from '@/stores/alerts'
import SubNav from '@/components/common/SubNav.vue'

const { t } = useI18n()
const auth = useAuthStore()
const alerts = useAlertsStore()

const items = computed(() => [
  { to: '/requests/vehicles/business-trip', label: t('nav.requestOutside'), icon: 'mapPin', names: ['vehicle-request-business-trip'] },
  { to: '/requests/vehicles/shuttle', label: t('nav.requestShuttle'), icon: 'clock', names: ['vehicle-request-shuttle'] },
  { to: '/requests/vehicles/events', label: t('nav.groupTrips'), icon: 'users', names: ['vehicle-request-events'] },
  { to: '/requests/vehicles/mine', label: t('vehicleBooking.mineTab'), icon: 'document', names: ['vehicle-request-mine'] },
  {
    to: '/requests/vehicles/approvals',
    label: t('approvals.title'),
    icon: 'checkCircle',
    names: ['vehicle-request-approvals'],
    show: !!auth.user?.approvalLevel,
    badge: alerts.approvals,
  },
  {
    to: '/requests/vehicles/manage',
    label: t('admin.vehicleRequests'),
    icon: 'truck',
    names: ['vehicle-request-manage', 'vehicle-request-manage-events'],
    show: auth.isAdmin,
    badge: alerts.vehicleManage,
  },
  {
    to: '/requests/vehicles/driver-schedule',
    label: t('fleet.section.schedule'),
    icon: 'calendar',
    names: ['vehicle-request-driver-schedule'],
    show: auth.isAdmin,
  },
  {
    to: '/requests/vehicles/routes',
    label: t('fleet.section.shuttle_routes'),
    icon: 'route',
    names: ['vehicle-request-routes'],
    show: auth.isAdmin,
  },
  {
    to: '/requests/vehicles/passengers',
    label: t('admin.passengers'),
    icon: 'user',
    names: ['vehicle-request-passengers'],
    show: auth.isAdmin,
  },
])
</script>

<template>
  <SubNav :items="items" />
  <div class="page-container">
    <RouterView />
  </div>
</template>
