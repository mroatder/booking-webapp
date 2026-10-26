<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsersStore } from '@/stores/users'
import { useToastStore } from '@/stores/toast'
import { ApiError } from '@/api/client'

// ค้นหาผู้ใช้ใน AD แล้วเลือกเพิ่มเข้าระบบ - ไม่ต้องรอให้ผู้ใช้ login ครั้งแรกเอง
const emit = defineEmits(['close'])
const { t } = useI18n()
const usersStore = useUsersStore()
const toast = useToastStore()

const MIN_QUERY = 2
const query = ref('')
const results = ref([])
const selected = ref(new Set())
const role = ref('Employee')
const isSearching = ref(false)
const isImporting = ref(false)
const errorCode = ref('')
const searched = ref(false)
const summary = ref(null)
const searchInput = ref(null)

let debounceTimer = null
let searchSeq = 0

// ค้นหาอัตโนมัติหลังหยุดพิมพ์ 400ms - ตัวนับ searchSeq กันผลของคำค้นเก่ากลับมาทับผลใหม่
watch(query, (q) => {
  clearTimeout(debounceTimer)
  errorCode.value = ''
  if (q.trim().length < MIN_QUERY) {
    results.value = []
    searched.value = false
    return
  }
  debounceTimer = setTimeout(() => runSearch(q.trim()), 400)
})

async function runSearch(q) {
  const seq = ++searchSeq
  isSearching.value = true
  try {
    const found = await usersStore.searchAd(q)
    if (seq !== searchSeq) return
    results.value = found
    searched.value = true
  } catch (err) {
    if (seq !== searchSeq) return
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
    results.value = []
  } finally {
    if (seq === searchSeq) isSearching.value = false
  }
}

function toggle(username) {
  const next = new Set(selected.value)
  if (next.has(username)) next.delete(username)
  else next.add(username)
  selected.value = next
}

const selectedCount = computed(() => selected.value.size)

async function onImport() {
  errorCode.value = ''
  isImporting.value = true
  try {
    const result = await usersStore.importAd([...selected.value], role.value)
    summary.value = result
    if (result.added.length) toast.success(t('toast.usersImported', { n: result.added.length }))
    selected.value = new Set()
    // อัปเดตป้าย "มีในระบบแล้ว" ของผลค้นหาที่ยังแสดงอยู่
    const addedNames = new Set(result.added.map((u) => u.username.toLowerCase()))
    results.value = results.value.map((r) =>
      addedNames.has(r.username.toLowerCase()) ? { ...r, alreadyAdded: true } : r,
    )
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isImporting.value = false
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && !isImporting.value) emit('close')
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await nextTick()
  searchInput.value?.focus()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="modal-backdrop" @click.self="!isImporting && emit('close')">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-import-title"
      class="modal-panel max-h-[90vh] max-w-2xl"
    >
      <div class="modal-header">
        <div>
          <h2 id="ad-import-title" class="text-base font-bold text-slate-900">{{ t('admin.adImportTitle') }}</h2>
          <p class="text-xs text-slate-500">{{ t('admin.adImportHint') }}</p>
        </div>
        <button
          type="button"
          :aria-label="t('common.close')"
          class="cursor-pointer text-slate-400 hover:text-slate-600"
          @click="emit('close')"
        >
          <AppIcon name="close" class="h-5 w-5" />
        </button>
      </div>

      <div class="border-b border-slate-100 px-5 py-3">
        <label for="ad-search" class="sr-only">{{ t('admin.filterSearch') }}</label>
        <input
          id="ad-search"
          ref="searchInput"
          v-model="query"
          type="search"
          autocomplete="off"
          :placeholder="t('admin.adSearchPlaceholder')"
          class="input"
        />
      </div>

      <div class="min-h-[12rem] flex-1 overflow-y-auto px-5 py-3">
        <p v-if="errorCode" role="alert" class="rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ t(`errors.${errorCode}`) }}
        </p>
        <p v-else-if="isSearching" class="text-sm text-slate-400">{{ t('common.loading') }}</p>
        <p v-else-if="query.trim().length < MIN_QUERY" class="text-sm text-slate-400">
          {{ t('admin.adSearchMin', { n: MIN_QUERY }) }}
        </p>
        <p v-else-if="searched && results.length === 0" class="text-sm text-slate-400">{{ t('admin.adSearchNoResults') }}</p>

        <ul v-else class="space-y-1.5">
          <li v-for="r in results" :key="r.username">
            <label
              :class="[
                'flex items-center gap-3 rounded-control border px-3 py-2 text-sm',
                r.alreadyAdded
                  ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                  : selected.has(r.username)
                    ? 'cursor-pointer border-slate-900 bg-slate-50'
                    : 'cursor-pointer border-slate-200 hover:bg-slate-50',
              ]"
            >
              <input
                type="checkbox"
                :checked="selected.has(r.username)"
                :disabled="r.alreadyAdded"
                @change="toggle(r.username)"
              />
              <span class="min-w-0 flex-1">
                <span class="font-medium" :class="r.alreadyAdded ? '' : 'text-slate-900'">{{ r.fullName }}</span>
                <span class="ml-2 text-xs text-slate-500">{{ r.username }}</span>
                <span class="block truncate text-xs text-slate-500">
                  {{ r.department }}
                </span>
              </span>
              <span v-if="r.alreadyAdded" class="shrink-0 rounded-control bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                {{ t('admin.adAlreadyAdded') }}
              </span>
            </label>
          </li>
        </ul>
        <p v-if="results.length >= 25" class="mt-2 text-xs text-slate-500">{{ t('admin.adSearchTooMany') }}</p>
      </div>

      <div
        v-if="summary"
        role="status"
        class="border-t border-slate-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-800"
      >
        {{ t('admin.adImportDone', { n: summary.added.length }) }}
        <span v-if="summary.skipped.length">- {{ t('admin.adImportSkipped', { names: summary.skipped.join(', ') }) }}</span>
        <span v-if="summary.notFound.length" class="text-red-700">
          - {{ t('admin.adImportNotFound', { names: summary.notFound.join(', ') }) }}
        </span>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <div class="flex items-center gap-2">
          <label for="ad-import-role" class="text-sm text-slate-700">{{ t('admin.role') }}</label>
          <select id="ad-import-role" v-model="role" class="rounded-control border border-slate-300 px-3 py-1.5 text-sm">
            <option value="Employee">{{ t('admin.roleEmployee') }}</option>
            <option value="Supervisor">{{ t('admin.roleSupervisor') }}</option>
            <option value="Admin">{{ t('admin.roleAdmin') }}</option>
          </select>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="isImporting"
            class="btn btn-secondary"
            @click="emit('close')"
          >
            {{ t('common.close') }}
          </button>
          <button
            type="button"
            :disabled="selectedCount === 0 || isImporting"
            class="btn btn-primary"
            @click="onImport"
          >
            {{ t('admin.adImportButton', { n: selectedCount }) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
