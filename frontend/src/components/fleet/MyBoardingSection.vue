<script setup>
// แท็บ "การขึ้นรถของฉัน" - รายการสายรถที่ฉันอยู่ (และคนที่ฉันลงชื่อให้) ตามที่ Admin ประกาศแล้ว: 1 สาย = 1 แถว
// กด "ดูรายละเอียด" เพื่อเปิด modal ดูทั้งสาย (ข้อมูลรถ/คนขับ + ผู้เดินทางทุกคนในสาย) - ตัวสลับ กำลังจะถึง | ที่ผ่านมาแล้ว
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import { useEventsStore } from '@/stores/events'
import { useToastStore } from '@/stores/toast'
import { formatDateTimeDMY, toLocalTimeStr } from '@/utils/datetime'
import { downloadFile } from '@/utils/download'

const { t } = useI18n()
const store = useEventsStore()
const toast = useToastStore()

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 7

const view = ref('upcoming') // 'upcoming' | 'past'
const page = ref(1)
const selected = ref(null)

const isPast = (r) => new Date(r.eventDate).getTime() < Date.now() - DAY_MS // เผื่อวันเดินทางวันนี้ 1 วัน

// สรุปของฉันในแต่ละสาย: คนที่เกี่ยวข้องกับฉัน (ตัวเอง/ลงชื่อให้) เวลาขึ้นรถแรกสุดของพวกเขา
const rows = computed(() =>
  store.myBoarding.map((r) => {
    const mineOnes = r.passengers.filter((p) => p.mine || p.registeredByMe).sort((a, b) => Number(b.mine) - Number(a.mine))
    const times = mineOnes.map((p) => p.boardingAt).filter(Boolean).sort()
    return { ...r, mineOnes, myTime: times[0] ?? null, past: isPast(r) }
  }),
)
const counts = computed(() => ({
  upcoming: rows.value.filter((r) => !r.past).length,
  past: rows.value.filter((r) => r.past).length,
}))
// กำลังจะถึง: ใกล้ถึงก่อน | ที่ผ่านมาแล้ว: ล่าสุดก่อน
const visible = computed(() => {
  const list = rows.value.filter((r) => (view.value === 'past' ? r.past : !r.past))
  const dir = view.value === 'past' ? -1 : 1
  return list.sort((a, b) => dir * (new Date(a.eventDate) - new Date(b.eventDate)) || dir * (a.routeId - b.routeId))
})
const paged = computed(() => visible.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch(view, () => {
  page.value = 1
})

// ส่งออก Excel ของสายนั้น (ทั้งสาย) - เซิร์ฟเวอร์ตรวจว่าเป็นสายของตัวเอง
const exportingId = ref(null)
async function exportRoute(r) {
  exportingId.value = r.routeId
  try {
    await downloadFile(`/api/events/boarding/routes/${r.routeId}/export`, 'boarding-route.xlsx')
  } catch {
    toast.error(t('groupTrips.exportFailed'))
  } finally {
    exportingId.value = null
  }
}

const timeOf = (iso) => (iso ? toLocalTimeStr(new Date(iso)) : '-')
const whoLabel = (r) =>
  r.mineOnes.map((p) => (p.mine ? t('boarding.you') : p.name)).join(', ') || '-'

const pillClass = (active) => [
  'seg-btn',
  active ? 'is-active' : '',
]
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-slate-500">{{ t('boarding.myPageHint') }}</p>
      <div class="seg">
        <button type="button" :class="pillClass(view === 'upcoming')" @click="view = 'upcoming'">
          {{ t('boarding.segUpcoming') }} ({{ counts.upcoming }})
        </button>
        <button type="button" :class="pillClass(view === 'past')" @click="view = 'past'">
          {{ t('boarding.segPast') }} ({{ counts.past }})
        </button>
      </div>
    </div>

    <div v-if="!visible.length" class="rounded-control border border-dashed border-slate-300 bg-white p-10 text-center">
      <AppIcon name="clock" class="mx-auto mb-2 h-6 w-6 text-slate-400" />
      <p class="text-sm font-medium text-slate-700">{{ view === 'past' ? t('boarding.emptyPast') : t('boarding.myEmpty') }}</p>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('groupTrips.colEvent') }}</th>
            <th>{{ t('groupTrips.colDate') }}</th>
            <th>{{ t('boarding.colRoute') }}</th>
            <th>{{ t('boarding.colName') }}</th>
            <th>{{ t('boarding.lblTime') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in paged" :key="r.routeId" class="align-top">
            <td>
              <p class="font-medium text-slate-900">{{ r.eventTitle }}</p>
              <p class="text-xs text-slate-500">{{ r.destination }}</p>
            </td>
            <td class="whitespace-nowrap">{{ formatDateTimeDMY(r.eventDate) }}</td>
            <td>
              <p class="font-medium text-slate-900">{{ r.routeName }}</p>
              <p class="text-xs text-slate-500">{{ t(`boarding.vehicle${r.vehicleType}`) }}{{ r.vehiclePlate ? ` • ${r.vehiclePlate}` : '' }}</p>
            </td>
            <td>{{ whoLabel(r) }}</td>
            <td class="whitespace-nowrap font-medium text-slate-900">{{ timeOf(r.myTime) }}</td>
            <td class="whitespace-nowrap text-right">
              <button
                type="button"
                class="btn btn-secondary"
                @click="selected = r"
              >
                {{ t('boarding.viewDetail') }}
              </button>
              <button
                type="button"
                :disabled="exportingId === r.routeId"
                class="btn btn-secondary ml-2"
                @click="exportRoute(r)"
              >
                <AppIcon name="download" class="h-4 w-4" />{{ t('boarding.exportExcel') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-model:page="page" :total="visible.length" :page-size="PAGE_SIZE" class="mt-4" />

    <!-- รายละเอียดทั้งสาย -->
    <div v-if="selected" class="modal-backdrop" @click.self="selected = null">
      <div class="modal-panel max-h-[90vh] max-w-3xl" role="dialog" aria-modal="true">
        <div class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 class="text-base font-bold text-slate-900">{{ selected.eventTitle }}</h2>
            <p class="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span class="flex items-center gap-1"><AppIcon name="mapPin" class="text-slate-400" />{{ selected.destination }}</span>
              <span class="flex items-center gap-1"><AppIcon name="calendar" class="text-slate-400" />{{ formatDateTimeDMY(selected.eventDate) }}</span>
            </p>
          </div>
          <button type="button" class="cursor-pointer text-slate-400 hover:text-slate-600" :aria-label="t('common.close')" @click="selected = null">
            <AppIcon name="close" class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto p-5">
          <dl class="grid grid-cols-1 gap-x-6 gap-y-2 rounded-control bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div class="flex gap-2">
              <dt class="font-bold text-slate-600">{{ t('boarding.colRoute') }}</dt>
              <dd class="font-bold text-slate-900">{{ selected.routeName }} • {{ t(`boarding.vehicle${selected.vehicleType}`) }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="font-bold text-slate-600">{{ t('boarding.lblPlate') }}</dt>
              <dd class="font-bold text-slate-900">{{ selected.vehiclePlate || '-' }}</dd>
            </div>
            <div class="flex gap-2 sm:col-span-2">
              <dt class="font-bold text-slate-600">{{ t('boarding.lblDriver') }}</dt>
              <dd class="text-slate-900">
                {{ selected.driverName || '-' }}
                <a v-if="selected.driverPhone" :href="`tel:${selected.driverPhone}`" class="ml-1 underline hover:text-slate-700">{{ selected.driverPhone }}</a>
              </dd>
            </div>
          </dl>

          <div class="overflow-hidden">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="w-14">{{ t('boarding.colOrder') }}</th>
                  <th>{{ t('boarding.lblTime') }}</th>
                  <th>{{ t('boarding.colName') }}</th>
                  <th>{{ t('boarding.colDept') }}</th>
                  <th>{{ t('boarding.colPhone') }}</th>
                  <th>{{ t('boarding.lblPickup') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(p, i) in selected.passengers" :key="p.passengerId" :class="p.mine || p.registeredByMe ? 'bg-slate-50 font-medium text-slate-900' : ''">
                  <td>{{ i + 1 }}</td>
                  <td class="whitespace-nowrap">{{ timeOf(p.boardingAt) }}</td>
                  <td>
                    {{ p.name }}
                    <span v-if="p.mine" class="chip chip-solid ml-1">{{ t('boarding.you') }}</span>
                    <span v-else-if="p.registeredByMe" class="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{{ t('boarding.registeredByMe') }}</span>
                  </td>
                  <td>{{ p.department || '-' }}</td>
                  <td class="whitespace-nowrap">
                    <a v-if="p.phone" :href="`tel:${p.phone}`" class="underline hover:text-ink">{{ p.phone }}</a>
                    <template v-else>-</template>
                  </td>
                  <td>{{ p.pickupLocation }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            :disabled="exportingId === selected.routeId"
            class="btn btn-secondary"
            @click="exportRoute(selected)"
          >
            <AppIcon name="download" class="h-4 w-4" />{{ t('boarding.exportExcel') }}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="selected = null"
          >
            {{ t('common.close') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
