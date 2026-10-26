<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import DatePicker from '@/components/common/DatePicker.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, errorCodeOf } from '@/api/client'
import { formatDateTimeDMY } from '@/utils/datetime'

const { t, te } = useI18n()

const PAGE_SIZE = 50
const filters = reactive({ from: '', to: '', action: '', q: '' })
const page = ref(1)
const items = ref([])
const total = ref(0)
const actions = ref([])
const isLoading = ref(false)
const errorCode = ref('')
const expanded = reactive({})

let seq = 0 // กันผลของคำขอเก่ากลับมาทับผลใหม่
async function load() {
  const mine = ++seq
  isLoading.value = true
  errorCode.value = ''
  try {
    const qs = new URLSearchParams({ page: String(page.value), pageSize: String(PAGE_SIZE) })
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v)
    const res = await api.get(`/audit?${qs}`)
    if (mine !== seq) return
    items.value = res.items
    total.value = res.total
  } catch (err) {
    if (mine === seq) errorCode.value = errorCodeOf(err)
  } finally {
    if (mine === seq) isLoading.value = false
  }
}

let debounce
watch(
  () => ({ ...filters }),
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      page.value === 1 ? load() : (page.value = 1)
    }, 300)
  },
)
watch(page, load)
onBeforeUnmount(() => clearTimeout(debounce))

onMounted(async () => {
  load()
  try {
    actions.value = await api.get('/audit/actions')
  } catch {
    actions.value = []
  }
})

const hasFilters = computed(() => Object.values(filters).some(Boolean))
function clearFilters() {
  Object.assign(filters, { from: '', to: '', action: '', q: '' })
}

// รหัส action/entity → ข้อความตามภาษา (ถ้ายังไม่มีคำแปลแสดงรหัสดิบ ไม่ให้หน้าพัง)
const actionLabel = (code) => (te(`audit.actions.${code}`) ? t(`audit.actions.${code}`) : code)
const entityLabel = (type) => (type && te(`audit.entities.${type}`) ? t(`audit.entities.${type}`) : type || '')

function whoLabel(row) {
  if (row.fullName) return row.fullName
  if (row.actor === 'system' || row.actor === 'tablet' || row.actor === 'anonymous') return t(`audit.actor.${row.actor}`)
  return row.actor || '-'
}

const sortedActions = computed(() =>
  [...actions.value].sort((a, b) => actionLabel(a).localeCompare(actionLabel(b))),
)

const hasDetails = (row) => row.details && Object.keys(row.details).length > 0
const pretty = (value) => JSON.stringify(value, null, 2)
const detailParts = (row) =>
  [
    ['before', row.details?.before],
    ['body', row.details?.body],
    ['query', row.details?.query],
    ['files', row.details?.files],
  ].filter(([, v]) => v !== undefined && v !== null)
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('audit.title') }}</h1>

    <div class="mb-4 flex flex-wrap items-end gap-x-3 gap-y-3">
      <div>
        <label class="label" for="audit-from">{{ t('audit.from') }}</label>
        <DatePicker id="audit-from" v-model="filters.from" />
      </div>
      <div>
        <label class="label" for="audit-to">{{ t('audit.to') }}</label>
        <DatePicker id="audit-to" v-model="filters.to" />
      </div>
      <div class="w-full sm:w-64">
        <label class="label" for="audit-action">{{ t('audit.action') }}</label>
        <select id="audit-action" v-model="filters.action" class="input">
          <option value="">{{ t('audit.allActions') }}</option>
          <option v-for="code in sortedActions" :key="code" :value="code">{{ actionLabel(code) }}</option>
        </select>
      </div>
      <label class="relative w-full sm:w-64">
        <span class="sr-only">{{ t('audit.search') }}</span>
        <AppIcon name="search" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
        <input v-model="filters.q" type="search" class="search-input" :placeholder="t('audit.search')" />
      </label>
      <button v-if="hasFilters" type="button" class="link-action pb-2 text-sm" @click="clearFilters">
        {{ t('audit.clearFilters') }}
      </button>
    </div>

    <p v-if="errorCode" class="mb-3 text-sm text-danger">{{ t(`errors.${errorCode}`) }}</p>

    <div class="overflow-x-auto">
      <table class="data-table ruled">
        <colgroup>
          <col class="w-44" />
          <col class="w-52" />
          <col />
          <col class="w-48" />
          <col class="w-12" />
        </colgroup>
        <thead>
          <tr>
            <th>{{ t('audit.colTime') }}</th>
            <th>{{ t('audit.colWho') }}</th>
            <th>{{ t('audit.colWhat') }}</th>
            <th class="hidden md:table-cell">{{ t('audit.colTarget') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in items" :key="row.id">
            <tr class="row-sub">
              <td class="whitespace-nowrap tabular-nums">{{ formatDateTimeDMY(row.createdAt, { withSeconds: true }) }}</td>
              <td class="text-ink">
                {{ whoLabel(row) }}
                <span v-if="row.username" class="block text-xs text-subtle">{{ row.username }}</span>
              </td>
              <td :class="row.action === 'auth.loginFailed' ? 'font-medium text-danger' : 'font-medium text-ink'">
                {{ actionLabel(row.action) }}
              </td>
              <td class="hidden md:table-cell">
                <template v-if="row.entityType">
                  {{ entityLabel(row.entityType) }}<span v-if="row.entityId" class="tabular-nums"> #{{ row.entityId }}</span>
                </template>
              </td>
              <td class="text-right">
                <button
                  v-if="hasDetails(row)"
                  type="button"
                  class="icon-btn"
                  :aria-expanded="!!expanded[row.id]"
                  :aria-label="t('audit.toggleDetails')"
                  @click="expanded[row.id] = !expanded[row.id]"
                >
                  <AppIcon name="chevronRight" class="transition-transform" :class="{ 'rotate-90': expanded[row.id] }" />
                </button>
              </td>
            </tr>
            <tr v-if="expanded[row.id]" class="row-sub">
              <td colspan="5" class="!h-auto pb-4">
                <dl class="grid gap-3 text-xs sm:grid-cols-2">
                  <div v-for="[key, value] in detailParts(row)" :key="key" class="min-w-0">
                    <dt class="mb-1 font-semibold text-ink">{{ t(`audit.detail.${key}`) }}</dt>
                    <dd><pre class="max-h-64 overflow-auto rounded-control bg-surface p-3 whitespace-pre-wrap text-muted">{{ pretty(value) }}</pre></dd>
                  </div>
                </dl>
                <p class="mt-2 text-xs text-subtle">
                  <span v-if="row.ip">{{ t('audit.ip') }}: {{ row.ip }} · </span>{{ row.method }} {{ row.path }}
                </p>
              </td>
            </tr>
          </template>
          <tr v-if="!isLoading && items.length === 0">
            <td colspan="5" class="py-10 text-center text-subtle">{{ t('audit.empty') }}</td>
          </tr>
          <tr v-if="isLoading && items.length === 0">
            <td colspan="5" class="py-10 text-center text-subtle">{{ t('common.loading') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-model:page="page" :total="total" :page-size="PAGE_SIZE" class="mt-4" />
  </section>
</template>
