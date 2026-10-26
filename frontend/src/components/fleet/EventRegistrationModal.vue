<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTimeDMY } from '@/utils/datetime'
import { openSafeUrl } from '@/utils/safeUrl'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useUsersStore } from '@/stores/users'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  event: { type: Object, required: true },
  submitting: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'submit'])

const auth = useAuthStore()
const usersStore = useUsersStore()
const { t } = useI18n()
const toast = useToastStore()

const regMode = ref('self') // 'self' | 'proxy'

// Self registration state
const selfPhone = ref('')
const selfPickup = ref('')
const selfMapUrl = ref('')
const selfTripType = ref('RoundTrip')
const selfNote = ref('')

// Proxy registration list
const proxyPassengers = ref([])

onMounted(async () => {
  selfPhone.value = auth.user?.phone || ''
  if (usersStore.directory.length === 0) {
    usersStore.fetchDirectory().catch(() => {})
  }
  // Initialize with 1 empty proxy passenger
  addProxyRow()
})

function addProxyRow() {
  proxyPassengers.value.push({
    userId: null,
    passengerName: '',
    department: '',
    search: '',
    phoneNumber: '',
    pickupLocation: '',
    googleMapUrl: '',
    tripType: 'RoundTrip',
    note: '',
  })
}

function removeProxyRow(index) {
  if (proxyPassengers.value.length > 1) {
    proxyPassengers.value.splice(index, 1)
  }
}

function selectUserForProxy(index, user) {
  const row = proxyPassengers.value[index]
  row.userId = user.id
  row.passengerName = user.fullName
  row.department = user.department || ''
  row.search = ''
}

function clearUserForProxy(index) {
  const row = proxyPassengers.value[index]
  row.userId = null
  row.passengerName = ''
  row.department = ''
}

/** พนักงานที่เลือกได้ในแถวนี้: ไม่รวมตัวเอง (มีแท็บลงชื่อให้ตนเอง) และคนที่เลือกไว้ในแถวอื่นแล้ว */
function candidates(row) {
  const taken = new Set(proxyPassengers.value.map((p) => p.userId).filter(Boolean))
  const q = row.search.trim().toLowerCase()
  return usersStore.directory
    .filter((u) => u.id !== auth.user?.id && !taken.has(u.id))
    .filter((u) => !q || u.fullName.toLowerCase().includes(q) || (u.department ?? '').toLowerCase().includes(q))
    .slice(0, 8)
}

function testMapLink(url) {
  openSafeUrl(url)
}

const isValid = computed(() => {
  if (regMode.value === 'self') {
    return selfPhone.value.trim() && selfPickup.value.trim()
  }
  return proxyPassengers.value.every((p) => p.userId && p.phoneNumber.trim() && p.pickupLocation.trim())
})

function handleSubmit() {
  if (!isValid.value) {
    toast.error(t('toast.eventRegisterIncomplete'))
    return
  }

  const payload =
    regMode.value === 'self'
      ? [
          {
            isSelf: true,
            userId: auth.user?.id,
            passengerName: auth.user?.fullName,
            employeeCode: auth.user?.employeeCode || '',
            department: auth.user?.department || '',
            phoneNumber: selfPhone.value.trim(),
            pickupLocation: selfPickup.value.trim(),
            googleMapUrl: selfMapUrl.value.trim() || null,
            tripType: selfTripType.value,
            note: selfNote.value.trim() || null,
          },
        ]
      : proxyPassengers.value.map((p) => ({
          // ชื่อ/รหัสพนักงาน/แผนกเซิร์ฟเวอร์เติมจากข้อมูลผู้ใช้เอง
          userId: p.userId,
          phoneNumber: p.phoneNumber.trim(),
          pickupLocation: p.pickupLocation.trim(),
          googleMapUrl: p.googleMapUrl.trim() || null,
          tripType: p.tripType,
          note: p.note.trim() || null,
        }))

  emit('submit', payload)
}
</script>

<template>
  <div class="modal-backdrop overflow-y-auto" @click.self="emit('close')">
    <div class="modal-panel max-w-2xl p-6 my-8">
      <div class="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h3 class="text-lg font-bold text-slate-900">
            {{ t('groupTrips.rTitle') }}: {{ event.Title }}
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">
            {{ t('groupTrips.colDestination') }}: {{ event.Destination }} • {{ t('groupTrips.rDepartsAt') }}: {{ formatDateTimeDMY(event.EventDate) }}
          </p>
        </div>
        <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="emit('close')"><AppIcon name="close" class="h-5 w-5" /></button>
      </div>

      <!-- Mode Selector -->
      <div class="seg mt-4 flex">
        <button
          type="button"
          class="seg-btn flex-1"
          :aria-pressed="regMode === 'self'"
          @click="regMode = 'self'"
        >
          <AppIcon name="userAdd" class="mr-1 -mt-0.5" />{{ t('groupTrips.rSelf') }} ({{ auth.user?.fullName }})
        </button>
        <button
          type="button"
          class="seg-btn flex-1"
          :aria-pressed="regMode === 'proxy'"
          @click="regMode = 'proxy'"
        >
          <AppIcon name="users" class="mr-1 -mt-0.5" />{{ t('groupTrips.rProxy') }}
        </button>
      </div>

      <form class="mt-4 space-y-4" @submit.prevent="handleSubmit">
        <!-- Self Mode Form -->
        <div v-if="regMode === 'self'" class="space-y-3 rounded-card bg-surface p-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rPhone') }} <span class="text-red-500">*</span></label>
              <input
                v-model="selfPhone"
                type="tel"
                required
                :placeholder="t('groupTrips.rPhonePh')"
                class="input mt-1"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rTripType') }}</label>
              <select
                v-model="selfTripType"
                class="input mt-1"
              >
                <option value="RoundTrip">{{ t('groupTrips.rRound') }}</option>
                <option value="GoOnly">{{ t('groupTrips.rGoOnly') }}</option>
                <option value="ReturnOnly">{{ t('groupTrips.rReturnOnly') }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rPickup') }} <span class="text-red-500">*</span></label>
            <input
              v-model="selfPickup"
              type="text"
              required
              :placeholder="t('groupTrips.rPickupPh')"
              class="input mt-1"
            />
          </div>

          <div>
            <div class="flex items-center justify-between">
              <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rMapLink') }}</label>
              <button
                v-if="selfMapUrl"
                type="button"
                class="text-xs text-accent underline font-medium"
                @click="testMapLink(selfMapUrl)"
              >
                <AppIcon name="mapPin" class="mr-1 -mt-0.5 h-3.5 w-3.5" />{{ t('groupTrips.rTestPin') }}
              </button>
            </div>
            <input
              v-model="selfMapUrl"
              type="url"
              :placeholder="t('groupTrips.rMapPh')"
              class="input mt-1 font-mono text-xs"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rNote') }}</label>
            <input
              v-model="selfNote"
              type="text"
              :placeholder="t('groupTrips.rNotePh')"
              class="input mt-1"
            />
          </div>
        </div>

        <!-- Proxy Mode Form -->
        <div v-else class="space-y-4">
          <div
            v-for="(p, idx) in proxyPassengers"
            :key="idx"
            class="relative rounded-card bg-surface p-4 space-y-3"
          >
            <div class="flex items-center justify-between border-b border-slate-200 pb-2">
              <span class="text-xs font-bold text-slate-700">{{ t('groupTrips.rPassengerN', { n: idx + 1 }) }}</span>
              <button
                v-if="proxyPassengers.length > 1"
                type="button"
                class="text-xs text-red-600 hover:underline"
                @click="removeProxyRow(idx)"
              >
                <AppIcon name="close" class="mr-1 -mt-0.5 h-3.5 w-3.5" />{{ t('groupTrips.rRemove') }}
              </button>
            </div>

            <!-- เลือกพนักงานจากรายชื่อในระบบเท่านั้น (ไม่พิมพ์ชื่อเอง) -->
            <div
              v-if="p.userId"
              class="flex items-center justify-between gap-3 rounded-control bg-accent-soft px-3 py-2"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-bold text-slate-900">{{ p.passengerName }}</p>
                <p class="text-xs text-slate-500">{{ p.department || '-' }} • {{ t('groupTrips.autoFilled') }}</p>
              </div>
              <button
                type="button"
                class="shrink-0 cursor-pointer text-xs font-bold text-accent hover:underline"
                @click="clearUserForProxy(idx)"
              >
                {{ t('groupTrips.changePerson') }}
              </button>
            </div>
            <div v-else>
              <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.pickEmployee') }} <span class="text-red-500">*</span></label>
              <input
                v-model="p.search"
                type="text"
                autocomplete="off"
                :placeholder="t('groupTrips.searchEmployee')"
                class="input mt-1 text-xs"
              />
              <ul
                v-if="candidates(p).length"
                class="mt-1 max-h-48 divide-y divide-hair overflow-y-auto bg-white text-xs"
              >
                <li v-for="u in candidates(p)" :key="u.id">
                  <button
                    type="button"
                    class="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    @click="selectUserForProxy(idx, u)"
                  >
                    <span class="font-medium text-slate-900">{{ u.fullName }}</span>
                    <span class="text-slate-500">{{ u.department || '-' }}</span>
                  </button>
                </li>
              </ul>
              <p v-else class="mt-1 text-xs text-slate-500">{{ t('groupTrips.noMatch', { q: p.search }) }}</p>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rPhoneShort') }} <span class="text-red-500">*</span></label>
              <input
                v-model="p.phoneNumber"
                type="tel"
                required
                placeholder="08X-XXX-XXXX"
                class="input mt-1 text-xs"
              />
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rPickupShort') }} <span class="text-red-500">*</span></label>
                <input
                  v-model="p.pickupLocation"
                  type="text"
                  required
                  :placeholder="t('groupTrips.rPickupShortPh')"
                  class="input mt-1 text-xs"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rTripType') }}</label>
                <select
                  v-model="p.tripType"
                  class="input mt-1 text-xs"
                >
                  <option value="RoundTrip">{{ t('groupTrips.rRound') }}</option>
                  <option value="GoOnly">{{ t('groupTrips.rGoOnly') }}</option>
                  <option value="ReturnOnly">{{ t('groupTrips.rReturnOnly') }}</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.rMapLinkShort') }}</label>
              <input
                v-model="p.googleMapUrl"
                type="url"
                placeholder="https://maps.app.goo.gl/..."
                class="input mt-1 text-xs font-mono"
              />
            </div>
          </div>

          <button
            type="button"
            class="btn btn-secondary w-full"
            @click="addProxyRow"
          >
            <AppIcon name="plus" class="mr-1 -mt-0.5" />{{ t('groupTrips.rAddPerson', { n: proxyPassengers.length + 1 }) }}
          </button>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            class="btn btn-secondary"
            @click="emit('close')"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="submit"
            :disabled="props.submitting || !isValid"
            class="btn btn-primary"
          >
            {{ t('groupTrips.rConfirm') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
