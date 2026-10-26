<script setup>
import { confirmDialog } from '@/utils/confirm'
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { errorCodeOf } from '@/api/client'
import { formatDateTimeDMY } from '@/utils/datetime'
import { sortEventsSoonestFirst } from '@/utils/eventSort'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useEventsStore } from '@/stores/events'
import EventCreateEditModal from '@/components/fleet/EventCreateEditModal.vue'
import EventRegistrationModal from '@/components/fleet/EventRegistrationModal.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import MyBoardingSection from '@/components/fleet/MyBoardingSection.vue'
import EventDetailsModal from '@/components/fleet/EventDetailsModal.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const { t } = useI18n()
const toast = useToastStore()
const auth = useAuthStore()
const eventsStore = useEventsStore()
const route = useRoute()
const router = useRouter()

// สองแท็บ: ลงชื่อขึ้นรถ | การขึ้นรถของฉัน - จำแท็บไว้ใน URL (?tab=boarding) ลิงก์ในอีเมลประกาศจึงเปิดแท็บหลังได้เลย
const tab = computed(() => (route.query.tab === 'boarding' ? 'boarding' : 'register'))
const setTab = (name) => router.replace({ query: name === 'boarding' ? { tab: 'boarding' } : {} })
const boardingCount = computed(() => eventsStore.myBoarding.length)

function showError(err) {
  toast.error(t(`errors.${errorCodeOf(err)}`, err.details ?? {}))
}

const showCreateModal = ref(false)
const editingEvent = ref(null)
const registeringEvent = ref(null)
const isRegistering = ref(false)
const isSaving = ref(false)
const viewingEvent = ref(null)

onMounted(() => {
  eventsStore.fetchEvents()
  // รายละเอียดการขึ้นรถที่ Admin ประกาศแล้ว (ของตัวเอง + คนที่ตัวเองลงชื่อให้) - ดึงไม่ได้ก็ไม่กระทบการลงชื่อ
  eventsStore.fetchMyBoarding().catch(() => {})
})

// หน้าละ 7 กิจกรรม เรียงจากที่จะเกิดขึ้นเร็วที่สุดก่อน (กิจกรรมที่จบแล้วอยู่ท้าย)
const PAGE_SIZE = 7
const page = ref(1)
const sortedEvents = computed(() => sortEventsSoonestFirst(eventsStore.events || []))
const pagedEvents = computed(() => sortedEvents.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
// ลบกิจกรรมจนหน้าสุดท้ายว่าง → ถอยกลับหน้าที่มีข้อมูล
watch(
  () => sortedEvents.value.length,
  (n) => {
    const last = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (page.value > last) page.value = last
  },
)

async function handleSaveEvent(payload) {
  isSaving.value = true
  try {
    if (editingEvent.value) {
      await eventsStore.updateEvent(editingEvent.value.EventID, payload)
    } else {
      await eventsStore.createEvent(payload)
    }
    toast.success(t('toast.eventSaved'))
    showCreateModal.value = false
    editingEvent.value = null
  } catch (err) {
    showError(err)
  } finally {
    isSaving.value = false
  }
}

async function handleDeleteEvent(event) {
  if (!await confirmDialog(t('groupTrips.confirmDeleteEvent', { title: event.Title }), { danger: true })) return
  try {
    await eventsStore.deleteEvent(event.EventID)
    toast.success(t('toast.eventDeleted', { title: event.Title }))
  } catch (err) {
    showError(err)
  }
}

async function handleRegisterSubmit(passengersPayload) {
  if (!registeringEvent.value) return
  isRegistering.value = true
  try {
    await eventsStore.registerPassenger(registeringEvent.value.EventID, { passengers: passengersPayload })
    toast.success(t('toast.eventRegistered'))
    registeringEvent.value = null
  } catch (err) {
    showError(err)
  } finally {
    isRegistering.value = false
  }
}

async function handleCancelPassenger(passengerId) {
  if (!viewingEvent.value) return
  if (!await confirmDialog(t('groupTrips.confirmCancelRegistration'), { danger: true })) return
  try {
    await eventsStore.cancelRegistration(viewingEvent.value.EventID, passengerId)
    // Update active viewing event
    viewingEvent.value = eventsStore.activeEvent
    toast.success(t('toast.eventRegistrationCancelled'))
  } catch (err) {
    showError(err)
  }
}

function openViewModal(event) {
  eventsStore.fetchEventById(event.EventID).then((fullEvent) => {
    viewingEvent.value = fullEvent
  })
}

function isClosed(event) {
  if (event.RegistrationDeadline && new Date() > new Date(event.RegistrationDeadline)) return true
  return false
}

</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('groupTrips.pageTitle') }}</h1>
    <p class="page-note mb-4">{{ t('groupTrips.pageSubtitle') }}</p>

    <div class="mb-5 flex flex-wrap items-center gap-3">
      <div class="seg" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'register'"
          :class="['seg-btn !text-sm', tab === 'register' ? 'is-active' : '']"
          @click="setTab('register')"
        >
          {{ t('groupTrips.tabRegister') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'boarding'"
          :class="['seg-btn !text-sm', tab === 'boarding' ? 'is-active' : '']"
          @click="setTab('boarding')"
        >
          {{ t('boarding.myPageTitle') }}
          <span v-if="boardingCount" class="chip chip-solid ml-1">{{ boardingCount }}</span>
        </button>
      </div>
      <button v-if="auth.isAdmin" type="button" class="btn btn-primary sm:ml-auto" @click="editingEvent = null; showCreateModal = true">
        <AppIcon name="plus" />{{ t('groupTrips.createEvent') }}
      </button>
    </div>

    <MyBoardingSection v-if="tab === 'boarding'" />

    <template v-else>
    <p v-if="eventsStore.isLoading && !(eventsStore.events || []).length" class="py-10 text-center text-sm text-slate-500">
      {{ t('common.loading') }}
    </p>

    <div v-else-if="!(eventsStore.events || []).length" class="empty-state">
      <p class="font-medium text-ink">{{ t('groupTrips.emptyTitle') }}</p>
      <p>{{ t('groupTrips.emptyHint') }}</p>
    </div>

    <!-- รายการกิจกรรม -->
    <div v-else class="table-narrow overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('groupTrips.colEvent') }}</th>
            <th>{{ t('groupTrips.colDestination') }}</th>
            <th>{{ t('groupTrips.colDate') }}</th>
            <th>{{ t('groupTrips.colDeadline') }}</th>
            <th class="text-right">{{ t('groupTrips.colPeople') }}</th>
            <th>{{ t('groupTrips.colStatus') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in pagedEvents" :key="event.EventID" class="align-top">
            <td class="py-3">
              <p class="font-medium text-ink">{{ event.Title }}</p>
              <p v-if="event.Description" class="mt-0.5 max-w-xs truncate text-xs text-muted">{{ event.Description }}</p>
            </td>
            <td class="py-3">{{ event.Destination }}</td>
            <td class="py-3 whitespace-nowrap">
              <p>{{ formatDateTimeDMY(event.EventDate) }}</p>
              <p v-if="event.ReturnDate" class="text-xs text-slate-500">{{ t('groupTrips.returnLabel') }} {{ formatDateTimeDMY(event.ReturnDate) }}</p>
            </td>
            <td class="py-3 whitespace-nowrap">{{ event.RegistrationDeadline ? formatDateTimeDMY(event.RegistrationDeadline) : '-' }}</td>
            <td class="py-3 text-right font-semibold text-ink">{{ event.PassengerCount }}</td>
            <td class="py-3 whitespace-nowrap">
              <span :class="['chip', isClosed(event) ? '' : '!bg-emerald-100 !text-emerald-800']">
                {{ isClosed(event) ? t('groupTrips.statusClosed') : t('groupTrips.statusOpen') }}
              </span>
            </td>
            <td class="py-3 text-right whitespace-nowrap">
              <button type="button" :disabled="isClosed(event)" class="btn btn-primary btn-sm" @click="registeringEvent = event">
                {{ t('groupTrips.actRegister') }}
              </button>
              <button type="button" class="link-action ml-3" @click="openViewModal(event)">{{ t('groupTrips.actList') }}</button>
              <template v-if="auth.isAdmin">
                <button type="button" class="link-action ml-3" @click="editingEvent = event; showCreateModal = true">
                  {{ t('groupTrips.actEdit') }}
                </button>
                <button type="button" class="link-danger ml-3" @click="handleDeleteEvent(event)">
                  {{ t('groupTrips.actDelete') }}
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-model:page="page" :total="sortedEvents.length" :page-size="PAGE_SIZE" class="mt-4" />
    </template>

    <!-- Modals -->
    <EventCreateEditModal
      v-if="showCreateModal"
      :event="editingEvent"
      :submitting="isSaving"
      @close="showCreateModal = false; editingEvent = null"
      @save="handleSaveEvent"
    />

    <EventRegistrationModal
      v-if="registeringEvent"
      :event="registeringEvent"
      :submitting="isRegistering"
      @close="registeringEvent = null"
      @submit="handleRegisterSubmit"
    />

    <EventDetailsModal
      v-if="viewingEvent"
      :event="viewingEvent"
      @close="viewingEvent = null"
      @register="registeringEvent = viewingEvent; viewingEvent = null"
      @cancel-passenger="handleCancelPassenger"
    />
  </section>
</template>
