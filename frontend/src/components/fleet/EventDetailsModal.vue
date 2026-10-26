<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTimeDMY } from '@/utils/datetime'
import { openSafeUrl, safeUrl } from '@/utils/safeUrl'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { downloadFile } from '@/utils/download'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  event: { type: Object, required: true },
})
const emit = defineEmits(['close', 'register', 'cancelPassenger'])

const auth = useAuthStore()
const toast = useToastStore()
const { t } = useI18n()
const isExporting = ref(false)

const passengers = computed(() => props.event.passengers || [])

function canCancel(p) {
  if (auth.isAdmin) return true
  if (p.RegisteredByUserID === auth.user?.id) return true
  if (p.UserID === auth.user?.id) return true
  return false
}

function openGoogleMap(url) {
  openSafeUrl(url)
}

function tripTypeLabel(type) {
  if (type === 'GoOnly') return t('groupTrips.tripGo')
  if (type === 'ReturnOnly') return t('groupTrips.tripReturn')
  return t('groupTrips.tripRound')
}

async function exportReport() {
  if (!auth.isAdmin || isExporting.value) return
  isExporting.value = true
  try {
    await downloadFile(`/api/events/${props.event.EventID}/report`, 'passengers.xlsx')
  } catch {
    toast.error(t('groupTrips.exportFailed'))
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop overflow-y-auto" @click.self="emit('close')">
    <div class="modal-panel max-w-5xl p-6 my-8">
      <!-- Header -->
      <div class="flex items-start justify-between border-b border-slate-200 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-xl font-bold text-slate-900">{{ event.Title }}</h3>
            <span class="rounded-full bg-accent-soft px-3 py-0.5 text-xs font-bold text-accent">
              {{ t('groupTrips.dPeople', { n: passengers.length }) }}
            </span>
          </div>
          <p class="text-xs text-slate-600 mt-1">
            <AppIcon name="mapPin" class="-mt-0.5 text-slate-400" /> {{ t('groupTrips.colDestination') }}: <span class="font-bold text-slate-800">{{ event.Destination }}</span> • 
            <AppIcon name="calendar" class="-mt-0.5 text-slate-400" /> {{ t('groupTrips.colDate') }}: <span class="font-bold text-slate-800">{{ formatDateTimeDMY(event.EventDate) }}</span>
            <template v-if="event.ReturnDate">
              • <AppIcon name="refresh" class="-mt-0.5 text-slate-400" /> {{ t('groupTrips.tripReturn') }}: {{ formatDateTimeDMY(event.ReturnDate) }}
            </template>
          </p>
          <p v-if="event.Description" class="text-xs text-slate-500 mt-1">
            {{ event.Description }}
          </p>
        </div>
        <button type="button" class="cursor-pointer text-slate-400 hover:text-slate-600" @click="emit('close')"><AppIcon name="close" class="h-5 w-5" /></button>
      </div>

      <!-- Actions Bar -->
      <div class="my-4 flex flex-wrap items-center justify-between gap-3 bg-surface p-3 rounded-card">
        <div class="text-xs font-medium text-slate-700">
          {{ t('groupTrips.dAllPassengers', { n: passengers.length }) }}
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="auth.isAdmin"
            type="button"
            :disabled="isExporting || passengers.length === 0"
            class="btn btn-secondary btn-sm"
            @click="exportReport"
          >
            <AppIcon name="download" />{{ t('groupTrips.exportReport') }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            @click="emit('register')"
          >
            <AppIcon name="userAdd" />{{ t('groupTrips.rTitle') }}
          </button>
        </div>
      </div>

      <!-- Passenger Table -->
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="text-center">#</th>
              <th>{{ t('groupTrips.dColPassenger') }}</th>
              <th>{{ t('groupTrips.dColDeptCode') }}</th>
              <th>{{ t('groupTrips.rPhoneShort') }}</th>
              <th>{{ t('groupTrips.rPickup') }}</th>
              <th class="text-center">{{ t('groupTrips.dColMap') }}</th>
              <th class="text-center">{{ t('groupTrips.dColTrip') }}</th>
              <th>{{ t('groupTrips.dColRegisteredBy') }}</th>
              <th class="text-center">{{ t('groupTrips.dColActions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="passengers.length === 0">
              <td colspan="9"><p class="empty-state">{{ t('groupTrips.dEmpty') }}</p></td>
            </tr>
            <tr v-for="(p, idx) in passengers" :key="p.PassengerID">
              <td class="text-center font-mono text-slate-400">{{ idx + 1 }}</td>
              <td class="font-bold text-slate-900">{{ p.PassengerName }}</td>
              <td>
                {{ p.Department || '-' }}
                <span v-if="p.EmployeeCode" class="block text-xs text-slate-400">({{ p.EmployeeCode }})</span>
              </td>
              <td class="font-mono font-medium text-accent">
                <a :href="`tel:${p.PhoneNumber}`" class="hover:underline">{{ p.PhoneNumber }}</a>
              </td>
              <td class="max-w-[200px] break-words">
                <span class="font-medium text-slate-900">{{ p.PickupLocation }}</span>
                <span v-if="p.Note" class="block text-xs text-slate-500 italic">{{ t('groupTrips.dNote') }}: {{ p.Note }}</span>
              </td>
              <td class="text-center">
                <button
                  v-if="safeUrl(p.GoogleMapUrl)"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="openGoogleMap(p.GoogleMapUrl)"
                >
                  <AppIcon name="mapPin" class="mr-1 -mt-0.5 h-3.5 w-3.5" />{{ t('groupTrips.dOpenPin') }}
                </button>
                <span v-else class="text-slate-300">-</span>
              </td>
              <td class="text-center whitespace-nowrap">
                <span class="rounded-control px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-700">
                  {{ tripTypeLabel(p.TripType) }}
                </span>
              </td>
              <td class="text-xs text-slate-500">
                {{ p.RegisteredByName }}
              </td>
              <td class="text-center">
                <button
                  v-if="canCancel(p)"
                  type="button"
                  class="text-xs font-bold text-red-600 hover:underline"
                  @click="emit('cancelPassenger', p.PassengerID)"
                >
                  {{ t('common.cancel') }}
                </button>
                <span v-else class="text-slate-300">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex justify-end pt-3 border-t border-slate-200">
        <button
          type="button"
          class="btn btn-secondary"
          @click="emit('close')"
        >
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>
