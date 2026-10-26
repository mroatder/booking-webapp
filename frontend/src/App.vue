<script setup>
import { watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAlertsStore } from '@/stores/alerts'
import NotificationBell from '@/components/NotificationBell.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const { t, locale } = useI18n()

// ชื่อแท็บเบราว์เซอร์และ lang ของหน้าต้องตามภาษาที่เลือก
watchEffect(() => {
  document.title = t('common.appName')
  document.documentElement.lang = locale.value
  // ข้อความ "* = ต้องกรอก" ที่ style.css แสดงบนสุดของฟอร์มที่มีช่องบังคับ
  document.documentElement.style.setProperty('--required-note', JSON.stringify(t('common.requiredNote')))
})
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const alerts = useAlertsStore()

// แจ้งเตือนงานรอดำเนินการ: ดึงทุก 1 นาทีเมื่อล็อกอิน + ดึงใหม่ทุกครั้งที่เปลี่ยนหน้า (ตัวเลขเปลี่ยนหลังอนุมัติ/จัดรถ)
watch(
  () => auth.isAuthenticated,
  (on) => (on ? alerts.startPolling() : alerts.stopPolling()),
  { immediate: true },
)
watch(
  () => route.fullPath,
  () => auth.isAuthenticated && alerts.refresh(),
)

async function onLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-white">
    <header v-if="!route.meta.hideChrome" class="sticky top-0 z-40 bg-white">
      <div class="page-bar flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
        <div class="flex min-w-0 items-center gap-3 lg:gap-6">
          <RouterLink to="/" class="mr-0 flex shrink-0 items-center gap-2 lg:mr-2">
            <img src="/logo/logo.png" :alt="t('common.logoAlt')" class="h-8 w-auto object-contain" />
          </RouterLink>
          <RouterLink
            v-if="auth.isAuthenticated"
            to="/"
            exact-active-class="nav-link-active"
            class="nav-link"
          >
            {{ t('nav.home') }}
          </RouterLink>
          <RouterLink
            v-if="auth.isAuthenticated"
            to="/bookings/rooms"
            active-class="nav-link-active"
            class="nav-link"
          >
            {{ t('nav.roomBooking') }}
          </RouterLink>
          <RouterLink
            v-if="auth.isAuthenticated"
            to="/requests/vehicles"
            active-class="nav-link-active"
            class="nav-link"
          >
            {{ t('nav.vehicleBooking') }}
          </RouterLink>
          <RouterLink
            v-if="auth.isAdmin"
            to="/admin"
            active-class="nav-link-active"
            class="nav-link"
          >
            {{ t('nav.admin') }}
          </RouterLink>
        </div>
        <div class="flex items-center gap-2.5 lg:gap-4">
          <NotificationBell v-if="auth.isAuthenticated" />
          <RouterLink
            v-if="auth.isAuthenticated"
            to="/profile"
            active-class="nav-link-active"
            class="nav-link max-w-[6rem] truncate lg:max-w-[12rem]"
            :title="t('nav.profile')"
          >
            {{ auth.user?.fullName || auth.user?.username }}
          </RouterLink>
          <button
            v-if="auth.isAuthenticated"
            type="button"
            class="nav-link cursor-pointer"
            @click="onLogout"
          >
            {{ t('nav.logout') }}
          </button>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
    <main>
      <RouterView />
    </main>
    <ToastContainer />
    <ConfirmDialog />
  </div>
</template>
