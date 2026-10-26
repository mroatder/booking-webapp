<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import SubNav from '@/components/common/SubNav.vue'

const { t } = useI18n()
const auth = useAuthStore()

const items = computed(() => [
  { to: '/bookings/rooms/new', label: t('roomBooking.newTab'), icon: 'plus', names: ['room-booking-new'] },
  { to: '/bookings/rooms/mine', label: t('roomBooking.mineTab'), icon: 'calendar', names: ['room-booking-mine'] },
  {
    to: '/bookings/rooms/manage',
    label: t('roomBooking.manageTab'),
    icon: 'viewGrid',
    names: ['room-booking-manage'],
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
