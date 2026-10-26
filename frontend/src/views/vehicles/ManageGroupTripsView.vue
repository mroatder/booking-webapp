<script setup>
import { confirmDialog } from '@/utils/confirm'
// จัดการคำขอรถ > เดินทางกลุ่ม (Admin): รายการกิจกรรม → ส่งออกรายงานรายชื่อ/จุดขึ้นรถ (Excel) ไปส่งบริษัทรถ
// → เมื่อบริษัทรถจัดรถแล้ว กรอกรายละเอียดการขึ้นรถ (สาย/เวลา/ทะเบียน/คนขับ) แล้วประกาศให้พนักงาน
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { errorCodeOf } from '@/api/client'
import AppIcon from '@/components/common/AppIcon.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import EventBoardingEditor from '@/components/fleet/EventBoardingEditor.vue'
import ManageViewSwitch from '@/components/fleet/ManageViewSwitch.vue'
import { useEventsStore } from '@/stores/events'
import { useToastStore } from '@/stores/toast'
import { formatDateTimeDMY } from '@/utils/datetime'
import { downloadFile } from '@/utils/download'
import { sortEventsSoonestFirst } from '@/utils/eventSort'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useEventsStore()
const toast = useToastStore()

const isLoading = ref(false)
const exportingId = ref(null)
const editor = ref(null)

// หน้าละ 7 กิจกรรม เรียงจากที่จะเกิดขึ้นเร็วที่สุดก่อน (กิจกรรมที่จบแล้วอยู่ท้าย) - เหมือนหน้าการเดินทางกลุ่มของพนักงาน
const PAGE_SIZE = 7
const page = ref(1)
const sortedEvents = computed(() => sortEventsSoonestFirst(store.events || []))
const pagedEvents = computed(() => sortedEvents.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch(
  () => sortedEvents.value.length,
  (n) => {
    const last = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (page.value > last) page.value = last
  },
)

const eventId = computed(() => (route.params.eventId ? Number(route.params.eventId) : null))
const selected = computed(() => store.events.find((e) => e.EventID === eventId.value) ?? null)

// ร่างที่ยังไม่บันทึกต้องไม่หายเงียบๆ เมื่อออกจากหน้าหรือสลับกิจกรรม
const confirmLeave = async () => !editor.value?.isDirty || await confirmDialog(t('boarding.confirmDiscard'))
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)

const openBoarding = (event) => router.push({ name: 'vehicle-request-manage-events', params: { eventId: event.EventID } })
const backToList = () => router.push({ name: 'vehicle-request-manage-events' })

onMounted(async () => {
  isLoading.value = true
  try {
    await store.fetchEvents()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  } finally {
    isLoading.value = false
  }
})

async function exportReport(event) {
  exportingId.value = event.EventID
  try {
    await downloadFile(`/api/events/${event.EventID}/report`, 'passengers.xlsx')
  } catch {
    toast.error(t('groupTrips.exportFailed'))
  } finally {
    exportingId.value = null
  }
}
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('admin.vehicleRequests') }}</h1>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p v-if="!eventId" class="page-note !mt-0">{{ t('groupTrips.listHint') }}</p>
      <ManageViewSwitch class="ml-auto" />
    </div>

    <p v-if="isLoading && !store.events.length" class="py-10 text-center text-sm text-slate-500">{{ t('common.loading') }}</p>

    <template v-else-if="eventId">
      <EventBoardingEditor v-if="selected" :key="eventId" ref="editor" :event="selected" @back="backToList" />
      <p v-else class="py-10 text-center text-sm text-slate-500">{{ t('errors.NOT_FOUND') }}</p>
    </template>

    <template v-else>
    <div class="table-narrow overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th class="p-3">{{ t('groupTrips.colEvent') }}</th>
            <th class="p-3">{{ t('groupTrips.colDestination') }}</th>
            <th class="p-3">{{ t('groupTrips.colDate') }}</th>
            <th class="p-3 text-right">{{ t('groupTrips.colPeople') }}</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!store.events.length">
            <td colspan="5" class="p-6 text-center text-slate-500">{{ t('groupTrips.noEvents') }}</td>
          </tr>
          <tr v-for="event in pagedEvents" :key="event.EventID">
            <td class="p-3 font-medium text-slate-900">{{ event.Title }}</td>
            <td class="p-3">{{ event.Destination }}</td>
            <td class="whitespace-nowrap p-3">{{ formatDateTimeDMY(event.EventDate) }}</td>
            <td class="p-3 text-right font-semibold">{{ event.PassengerCount }}</td>
            <td class="whitespace-nowrap p-3 text-right">
              <button
                type="button"
                :disabled="!event.PassengerCount || exportingId === event.EventID"
                class="btn btn-secondary btn-sm mr-2"
                @click="exportReport(event)"
              >
                <AppIcon name="download" class="h-3.5 w-3.5" />{{ t('groupTrips.exportReport') }}
              </button>
              <button
                type="button"
                :disabled="!event.PassengerCount"
                class="btn btn-primary btn-sm"
                @click="openBoarding(event)"
              >
                <AppIcon name="route" class="h-3.5 w-3.5" />{{ t('boarding.manageButton') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar v-model:page="page" :total="sortedEvents.length" :page-size="PAGE_SIZE" class="mt-4" />
    </template>
  </section>
</template>
