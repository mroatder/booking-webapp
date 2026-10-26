<script setup>
import { confirmDialog } from '@/utils/confirm'
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDepartmentsStore } from '@/stores/departments'
import { useToastStore } from '@/stores/toast'
import { ApiError, errorCodeOf } from '@/api/client'

const { t } = useI18n()
const departmentsStore = useDepartmentsStore()
const toast = useToastStore()

const isModalOpen = ref(false)
const isSubmitting = ref(false)
const errorCode = ref('')
const editingId = ref(null)
const modalEl = ref(null)

const form = reactive({
  name: '',
  parentDepartmentId: null
})

onMounted(() => {
  departmentsStore.fetchAll()
})

const parentOptions = computed(() => {
  // ไม่ให้เลือกตัวเองหรือลูกของตัวเองเป็น parent
  const invalidParents = new Set()
  if (editingId.value) {
    invalidParents.add(editingId.value)
    // หา descendants อย่างง่าย
    const addChildren = (parentId) => {
      departmentsStore.departments
        .filter(d => d.parentDepartmentId === parentId)
        .forEach(child => {
          invalidParents.add(child.id)
          addChildren(child.id)
        })
    }
    addChildren(editingId.value)
  }

  return departmentsStore.departments.filter(d => !invalidParents.has(d.id))
})

// จัดกลุ่มเป็นโครงสร้างต้นไม้เพื่อแสดงในตาราง
const treeData = computed(() => {
  const map = new Map()
  departmentsStore.departments.forEach(d => map.set(d.id, { ...d, children: [], level: 0 }))

  const roots = []
  map.forEach(d => {
    if (d.parentDepartmentId && map.has(d.parentDepartmentId)) {
      map.get(d.parentDepartmentId).children.push(d)
    } else {
      roots.push(d)
    }
  })

  const result = []
  const traverse = (node, level) => {
    node.level = level
    result.push(node)
    node.children.forEach(child => traverse(child, level + 1))
  }

  roots.forEach(r => traverse(r, 0))
  return result
})

function getParentName(parentId) {
  if (!parentId) return '-'
  const p = departmentsStore.departments.find(d => d.id === parentId)
  return p ? p.name : '-'
}

// ── มุมมองตาราง: กรองระดับ / ค้นหา / ย่อ-ขยายกลุ่ม ──
const filter = ref('all') // all | root | sub
const query = ref('')
const folded = reactive({})

const rootCount = computed(() => treeData.value.filter(d => d.level === 0).length)
const subCount = computed(() => treeData.value.length - rootCount.value)
const filters = computed(() => [
  { key: 'all', label: t('dept.filterAll'), count: treeData.value.length },
  { key: 'root', label: t('dept.filterRoot'), count: rootCount.value },
  { key: 'sub', label: t('dept.filterSub'), count: subCount.value }
])

// กลุ่ม = แผนกหลัก 1 แผนก + แผนกย่อยทั้งหมดใต้มัน (ตามลำดับต้นไม้)
const groups = computed(() => {
  const out = []
  treeData.value.forEach(d => {
    if (d.level === 0) out.push({ root: d, subs: [] })
    else out[out.length - 1]?.subs.push(d)
  })
  return out
})

const hit = d => {
  const q = query.value.trim().toLowerCase()
  return !q || d.name.toLowerCase().includes(q)
}

// แถวที่จะแสดง: { kind: 'group' | 'sub' | 'gap', dept, open?, foldable?, indent? }
const rows = computed(() => {
  const searching = !!query.value.trim()
  const out = []
  if (filter.value === 'sub') {
    treeData.value.filter(d => d.level > 0 && hit(d)).forEach(d => out.push({ kind: 'sub', dept: d, indent: false }))
    return out
  }
  if (filter.value === 'root') {
    groups.value.filter(g => hit(g.root)).forEach(g => out.push({ kind: 'group', dept: g.root, open: false, foldable: false }))
    return out
  }
  groups.value.forEach(g => {
    const subsHit = g.subs.filter(hit)
    if (searching && !hit(g.root) && subsHit.length === 0) return
    const open = searching ? true : !folded[g.root.id]
    out.push({ kind: 'group', dept: g.root, open, foldable: true })
    if (open) (searching && !hit(g.root) ? subsHit : g.subs).forEach(d => out.push({ kind: 'sub', dept: d, indent: true }))
    out.push({ kind: 'gap', dept: g.root })
  })
  return out
})

const shownCount = computed(() => rows.value.filter(r => r.kind !== 'gap').length)
const anyOpen = computed(() => groups.value.some(g => g.subs.length && !folded[g.root.id]))

function toggleFold(id) {
  folded[id] = !folded[id]
}
function toggleFoldAll() {
  const next = anyOpen.value
  groups.value.forEach(g => {
    folded[g.root.id] = next
  })
}

async function openModal() {
  isModalOpen.value = true
  await nextTick()
  modalEl.value?.querySelector('input')?.focus()
}

function closeModal() {
  isModalOpen.value = false
  editingId.value = null
  form.name = ''
  form.parentDepartmentId = null
  errorCode.value = ''
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.parentDepartmentId = null
  openModal()
}

function startEdit(dept) {
  editingId.value = dept.id
  form.name = dept.name
  form.parentDepartmentId = dept.parentDepartmentId
  openModal()
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    if (editingId.value) {
      await departmentsStore.update(editingId.value, { ...form })
      toast.success(t('dept.updated'))
    } else {
      await departmentsStore.create({ ...form })
      toast.success(t('dept.added'))
    }
    closeModal()
  } catch (err) {
    errorCode.value = err instanceof ApiError ? errorCodeOf(err) : 'GENERIC'
  } finally {
    isSubmitting.value = false
  }
}

async function onDelete(dept) {
  if (!await confirmDialog(t('dept.confirmDelete', { name: dept.name }), { danger: true })) return
  try {
    await departmentsStore.remove(dept.id)
    toast.success(t('dept.deleted'))
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('dept.title') }}</h1>

    <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('dept.filterLabel')">
        <button
          v-for="f in filters"
          :key="f.key"
          type="button"
          class="filter-chip"
          :aria-pressed="filter === f.key"
          @click="filter = f.key"
        >
          {{ f.label }}<span class="ml-1.5 text-xs opacity-70">{{ f.count }}</span>
        </button>
      </div>
      <span class="flex-1" />
      <button v-if="filter === 'all' && !query" type="button" class="link-action text-sm" @click="toggleFoldAll">
        {{ anyOpen ? t('dept.collapseAll') : t('dept.expandAll') }}
      </button>
      <label class="relative w-full sm:w-60">
        <AppIcon name="search" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
        <input v-model="query" type="search" class="search-input" :placeholder="t('dept.search')" :aria-label="t('dept.search')" />
      </label>
      <button type="button" class="btn btn-primary" @click="openCreate">
        <AppIcon name="plus" />{{ t('dept.add') }}
      </button>
    </div>

    <div class="overflow-x-auto">
      <table class="data-table ruled">
        <colgroup>
          <col />
          <col class="w-48" />
          <col class="w-24" />
        </colgroup>
        <thead>
          <tr>
            <th>{{ t('dept.colName') }}</th>
            <th class="hidden sm:table-cell">{{ filter === 'sub' ? t('dept.colParent') : t('dept.colSubs') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.kind + row.dept.id">
            <tr v-if="row.kind === 'gap'" class="row-gap"><td colspan="3"></td></tr>
            <tr v-else :class="row.kind === 'group' ? 'row-group' : 'row-sub'">
              <td>
                <div class="flex items-center gap-1.5">
                  <button
                    v-if="row.kind === 'group' && row.foldable"
                    type="button"
                    class="icon-btn -ml-1 text-muted"
                    :class="{ invisible: !row.dept.children.length }"
                    :tabindex="row.dept.children.length ? 0 : -1"
                    :aria-label="t('dept.toggle')"
                    @click="toggleFold(row.dept.id)"
                  >
                    <AppIcon name="chevronRight" class="transition-transform" :class="{ 'rotate-90': row.open }" />
                  </button>
                  <span
                    v-if="row.kind === 'sub' && row.indent"
                    class="-mt-2 mr-2 inline-block h-3 w-3 shrink-0 rounded-bl border-b-[1.5px] border-l-[1.5px] border-field"
                    :style="{ marginLeft: `${0.75 + (row.dept.level - 1) * 1.25}rem` }"
                  ></span>
                  <span :class="row.kind === 'group' ? 'text-[15px]' : 'text-ink'">{{ row.dept.name }}</span>
                </div>
              </td>
              <td class="hidden tabular-nums sm:table-cell">
                <template v-if="filter === 'sub'">{{ getParentName(row.dept.parentDepartmentId) }}</template>
                <template v-else-if="row.kind === 'group'">
                  <span v-if="row.dept.children.length" class="font-normal text-muted">{{ t('dept.subCount', { n: row.dept.children.length }) }}</span>
                  <span v-else class="font-normal text-subtle">{{ t('dept.noSubs') }}</span>
                </template>
              </td>
              <td class="text-right whitespace-nowrap">
                <button type="button" class="icon-btn" :aria-label="`${t('common.edit')} ${row.dept.name}`" @click="startEdit(row.dept)">
                  <AppIcon name="edit" />
                </button>
                <button
                  type="button"
                  class="icon-btn icon-btn-danger"
                  :aria-label="`${t('common.delete')} ${row.dept.name}`"
                  :disabled="row.dept.children.length > 0"
                  :title="row.dept.children.length ? t('dept.deleteFirst') : undefined"
                  @click="onDelete(row.dept)"
                >
                  <AppIcon name="trash" />
                </button>
              </td>
            </tr>
          </template>
          <tr v-if="rows.length === 0">
            <td colspan="3" class="py-10 text-center text-subtle">
              {{ treeData.length === 0 ? t('dept.empty') : t('dept.noMatch') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="treeData.length" class="mt-2 px-4 text-xs text-subtle">{{ t('dept.showing', { shown: shownCount, total: treeData.length }) }}</p>

    <!-- Modal -->
    <div v-if="isModalOpen" class="modal-backdrop" @click.self="!isSubmitting && closeModal()">
      <form ref="modalEl" class="modal-panel max-w-md" @submit.prevent="onSubmit">
        <div class="modal-header">
          <h2>{{ editingId ? t('dept.edit') : t('dept.add') }}</h2>
          <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="closeModal"><AppIcon name="close" /></button>
        </div>

        <div class="modal-body">
          <div>
            <label class="label" for="dept-name">{{ t('dept.colName') }}</label>
            <input id="dept-name" v-model="form.name" type="text" required class="input" />
          </div>
          <div>
            <label class="label" for="dept-parent">{{ t('dept.parentLabel') }}</label>
            <select id="dept-parent" v-model="form.parentDepartmentId" class="input">
              <option :value="null">{{ t('dept.parentNone') }}</option>
              <option v-for="p in parentOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <p v-if="errorCode" class="text-sm text-danger">{{ t(`errors.${errorCode}`) }}</p>
        </div>

        <div class="modal-footer">
          <button type="button" :disabled="isSubmitting" class="btn btn-secondary" @click="closeModal">
            {{ t('common.cancel') }}
          </button>
          <button type="submit" :disabled="isSubmitting" class="btn btn-primary">
            {{ t('common.save') }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
