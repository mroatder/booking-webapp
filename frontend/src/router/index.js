import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { hideChrome: true },
  },
  {
    path: '/tablet/:token',
    name: 'tablet-display',
    component: () => import('@/views/tablet/TabletDisplayView.vue'),
    meta: { hideChrome: true },
  },
  {
    path: '/bookings/rooms',
    component: () => import('@/layouts/RoomBookingLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'room-booking-new' } },
      { path: 'new', name: 'room-booking-new', component: () => import('@/views/rooms/BookRoomView.vue') },
      { path: 'mine', name: 'room-booking-mine', component: () => import('@/views/rooms/MyBookingsView.vue') },
      // Admin: การจองห้องของทุกคน (ใครจอง เมื่อไหร่ สถานะ) - dev 2026-09-30
      {
        path: 'manage',
        name: 'room-booking-manage',
        component: () => import('@/views/rooms/ManageRoomBookingsView.vue'),
        meta: { roles: ['Admin'] },
      },
    ],
  },
  {
    path: '/requests/vehicles',
    component: () => import('@/layouts/VehicleRequestLayout.vue'),
    // พนักงานทุกคนขอรถได้เอง (งานนอก + โอที) - dev ยืนยัน 2026-09-29 ไม่ใช่แค่หัวหน้างาน
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'vehicle-request-business-trip' } },
      {
        path: 'business-trip',
        name: 'vehicle-request-business-trip',
        component: () => import('@/views/vehicles/NewVehicleRequestView.vue'),
        props: { requestType: 'BusinessTrip' }
      },
      {
        path: 'shuttle',
        name: 'vehicle-request-shuttle',
        component: () => import('@/views/vehicles/NewVehicleRequestView.vue'),
        props: { requestType: 'Shuttle' }
      },
      {
        path: 'mine',
        name: 'vehicle-request-mine',
        component: () => import('@/views/vehicles/MyVehicleRequestsView.vue'),
      },
      {
        path: 'events',
        name: 'vehicle-request-events',
        component: () => import('@/views/vehicles/EventTripsView.vue'),
      },
      {
        // ผู้มีระดับอนุมัติ: คำขอรถนอกที่รอฉันอนุมัติ (backend กรองเฉพาะที่เลือกฉันเป็นผู้อนุมัติ)
        path: 'approvals',
        name: 'vehicle-request-approvals',
        component: () => import('@/views/vehicles/VehicleApprovalsView.vue'),
      },
      {
        path: 'manage',
        name: 'vehicle-request-manage',
        component: () => import('@/views/vehicles/ManageVehicleRequestsView.vue'),
        meta: { roles: ['Admin'] },
      },
      {
        path: 'manage/events/:eventId?',
        name: 'vehicle-request-manage-events',
        component: () => import('@/views/vehicles/ManageGroupTripsView.vue'),
        meta: { roles: ['Admin'] },
      },
      {
        path: 'driver-schedule',
        name: 'vehicle-request-driver-schedule',
        component: () => import('@/views/vehicles/DriverScheduleView.vue'),
        meta: { roles: ['Admin'] },
      },
      {
        path: 'routes',
        name: 'vehicle-request-routes',
        component: () => import('@/views/vehicles/ShuttleRoutesView.vue'),
        meta: { roles: ['Admin'] },
      },
      {
        path: 'passengers',
        name: 'vehicle-request-passengers',
        component: () => import('@/views/vehicles/ShuttlePassengersView.vue'),
        meta: { roles: ['Admin'] },
      },
    ],
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, roles: ['Admin'] },
    children: [
      { path: '', redirect: { name: 'admin-rooms' } },
      { path: 'rooms', name: 'admin-rooms', component: () => import('@/views/admin/RoomsView.vue') },
      { path: 'devices', name: 'admin-devices', component: () => import('@/views/admin/DevicesView.vue') },
      { path: 'departments', name: 'admin-departments', component: () => import('@/views/admin/DepartmentsView.vue') },
      { path: 'users', name: 'admin-users', component: () => import('@/views/admin/UsersView.vue') },
      // M8: รายงาน + ส่งออก Excel
      { path: 'reports', name: 'admin-reports', component: () => import('@/views/admin/ReportsView.vue') },
      { path: 'drivers', name: 'admin-drivers', component: () => import('@/views/admin/DriversView.vue') },
      // M9: บันทึกการใช้งาน (audit log) - Admin เท่านั้น (route แม่ /admin จำกัด role แล้ว)
      { path: 'audit', name: 'admin-audit', component: () => import('@/views/admin/AuditLogView.vue') },
    ],
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/ForbiddenView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.isReady) {
    await auth.fetchMe()
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // ลิงก์จากอีเมล (from=email) → login แล้วไปหน้าตามลิงก์เสมอ ไม่ว่าเปิดในแท็บไหน
    // session หมดอายุ (หน้าค้างไว้แล้วรีเฟรช ไม่ใช่ลิงก์อีเมล) → login แล้วไปหน้าแรก
    const fromEmail = to.query.from === 'email'
    return auth.sessionExpired && !fromEmail ? { name: 'login' } : { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.roles && !to.meta.roles.includes(auth.user?.role)) {
    return { name: 'forbidden' }
  }

  return true
})

// ไฟล์ของหน้า (lazy chunk) โหลดไม่ขึ้นเพราะเครือข่ายหลุดชั่วคราว - เบราว์เซอร์จำผลที่ล้มเหลวไว้ ลอง import ซ้ำไม่ได้
// จึงโหลดหน้านั้นใหม่ทั้งหน้า 1 ครั้ง (กันวนซ้ำด้วยตัวบันทึกใน sessionStorage - ถ้าล้มอีกให้แสดง error ตามปกติ)
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
const RELOAD_KEY = 'chunkReloadAt'
const RELOAD_WINDOW_MS = 10_000

function markReload() {
  // true = ยังไม่เคยรีโหลดในช่วงนี้ (บันทึกไว้แล้ว) - sessionStorage ใช้ไม่ได้ให้ถือว่ารีโหลดไม่ได้ เพื่อกันวนซ้ำ
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_WINDOW_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

router.onError((err, to) => {
  if (!CHUNK_ERROR.test(err?.message ?? '') || !markReload()) throw err
  window.location.assign(to?.fullPath ?? window.location.href)
})
