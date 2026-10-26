<script setup>
import { confirmDialog } from '@/utils/confirm'
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsersStore } from '@/stores/users'
import { useDepartmentsStore } from '@/stores/departments'
import { useToastStore } from '@/stores/toast'
import { ApiError, errorCodeOf } from '@/api/client'
import PaginationNav from '@/components/PaginationNav.vue'
import AdImportModal from '@/components/AdImportModal.vue'
import RosterImportModal from '@/components/RosterImportModal.vue'

const { t } = useI18n()
const usersStore = useUsersStore()
const toast = useToastStore()

const editingId = ref(null)
const editingAuthSource = ref('Local')
const form = reactive({
  canLogin: true, // false = รายชื่อเฉยๆ (พนักงานที่ไม่มีคอมพิวเตอร์) ไม่มี username/รหัสผ่าน
  username: '',
  password: '',
  employeeCode: '',
  fullName: '',
  fullNameTh: '',
  departmentId: null,
  phone: '',
  email: '',
  role: 'Employee',
  approvalLevel: '',
  isActive: true,
})
const errorCode = ref('')
const isSubmitting = ref(false)
const departmentsStore = useDepartmentsStore()

// ฟอร์มเพิ่ม/แก้ไขผู้ใช้อยู่ใน modal (เดิมเป็นฟอร์มค้างบนหน้า กินพื้นที่ตาราง)
const showRosterImport = ref(false) // modal นำเข้ารายชื่อไม่ login จาก Excel
const showAdImport = ref(false) // modal ค้นหา/เพิ่มผู้ใช้จาก AD
const isModalOpen = ref(false)
const modalEl = ref(null)

async function openModal() {
  isModalOpen.value = true
  await nextTick()
  // ช่องแรกที่แก้ได้ (ตอนแก้ไข username ถูกล็อก, ผู้ใช้ AD ล็อกโปรไฟล์ด้วย → ไปลงช่องสิทธิ์)
  modalEl.value?.querySelector('input:not([disabled]), select:not([disabled])')?.focus()
}

function closeModal() {
  isModalOpen.value = false
  resetForm()
}

function openCreate() {
  resetForm()
  openModal()
}

function onKeydown(event) {
  if (event.key === 'Escape' && isModalOpen.value && !isSubmitting.value) closeModal()
}

onMounted(() => {
  usersStore.fetchAll()
  departmentsStore.fetchAll()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function resetForm() {
  editingId.value = null
  editingAuthSource.value = 'Local'
  Object.assign(form, {
    canLogin: true,
    username: '',
    password: '',
    employeeCode: '',
    fullName: '',
    fullNameTh: '',
    departmentId: null,
    phone: '',
    email: '',
    role: 'Employee',
    approvalLevel: '',
    isActive: true,
  })
  errorCode.value = ''
}

function startEdit(user) {
  editingId.value = user.id
  editingAuthSource.value = user.authSource
  Object.assign(form, {
    canLogin: user.authSource !== 'None',
    username: user.username ?? '',
    password: '',
    employeeCode: user.employeeCode ?? '',
    fullName: user.fullName,
    fullNameTh: user.fullNameTh ?? '',
    departmentId: user.departmentId ?? null,
    phone: user.phone ?? '',
    email: user.email ?? '',
    role: user.role,
    approvalLevel: user.approvalLevel ?? '',
    isActive: user.isActive,
  })
  errorCode.value = ''
  openModal()
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    if (editingId.value) {
      await usersStore.update(editingId.value, {
        fullName: form.fullName,
        fullNameTh: form.fullNameTh || null,
        employeeCode: form.employeeCode || null,
        departmentId: form.departmentId || null,
        phone: form.phone || null,
        email: form.email || null,
        role: form.role,
        approvalLevel: form.approvalLevel || null,
        isActive: form.isActive,
      })
      toast.success(t('toast.userUpdated', { name: form.fullName }))
    } else {
      await usersStore.create(form.canLogin ? {
        username: form.username,
        password: form.password,
        employeeCode: form.employeeCode || null,
        fullName: form.fullName,
        fullNameTh: form.fullNameTh || null,
        departmentId: form.departmentId || null,
        phone: form.phone || null,
        email: form.email || null,
        role: form.role,
        approvalLevel: form.approvalLevel || null,
      } : {
        noLogin: true,
        employeeCode: form.employeeCode || null,
        fullName: form.fullName,
        fullNameTh: form.fullNameTh || null,
        departmentId: form.departmentId || null,
        phone: form.phone || null,
        email: form.email || null,
      })
      toast.success(t('toast.userCreated', { name: form.fullName }))
    }
    closeModal()
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isSubmitting.value = false
  }
}

// ----- ตัวกรองรายชื่อ (กรองฝั่ง browser จากรายชื่อที่โหลดมาแล้ว - ไม่ยิง API ใหม่ทุกครั้งที่พิมพ์) -----
// department: '' = ทุกแผนก, NO_DEPARTMENT = ผู้ใช้ที่ไม่มีแผนก, อื่นๆ = id ของแผนก
const NO_DEPARTMENT = '__none__'
const filters = reactive({ search: '', department: '', role: '', status: '', authSource: '' })

// ตัวเลือกแผนกสร้างจากข้อมูลจริงที่ดึงจาก /departments
const departments = computed(() => [...(departmentsStore.departments || [])].sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'th')))
// ตัวกรองแผนก: เรียงเป็นต้นไม้ แผนกหลักตามด้วยแผนกย่อย (เยื้องเข้าไป) - เลือกแผนกหลัก = รวมคนในแผนกย่อยทั้งหมด
const departmentLabel = (name, depth) => (depth ? '    '.repeat(depth - 1) + '  └ ' + name : name)
const departmentFilterOptions = computed(() => {
  const all = departments.value
  const ids = new Set(all.map((d) => d.id))
  const options = []
  const walk = (parentId, depth) => {
    for (const d of all.filter((x) => (x.parentDepartmentId ?? null) === parentId)) {
      options.push({ id: d.id, label: departmentLabel(d.name, depth) })
      walk(d.id, depth + 1)
    }
  }
  walk(null, 0)
  // แผนกที่ชี้ไปหาแผนกแม่ที่ไม่มีในรายการ ให้แสดงเป็นระดับบนสุด ไม่ให้หายจากตัวกรอง
  const shown = new Set(options.map((o) => o.id))
  for (const d of all.filter((x) => !shown.has(x.id) && !ids.has(x.parentDepartmentId))) {
    options.push({ id: d.id, label: departmentLabel(d.name, 0) })
    walk(d.id, 1)
  }
  return options
})
// id ของแผนกที่เลือกกรอง + แผนกย่อยทุกชั้น
function departmentWithDescendants(rootId) {
  const result = new Set([rootId])
  let added = true
  while (added) {
    added = false
    for (const d of departments.value) {
      if (!result.has(d.id) && result.has(d.parentDepartmentId)) {
        result.add(d.id)
        added = true
      }
    }
  }
  return result
}
const filterDepartmentIds = computed(() =>
  filters.department && filters.department !== NO_DEPARTMENT ? departmentWithDescendants(filters.department) : null,
)
// ตัวเลือกสำหรับตอนสร้าง/แก้ไขพนักงาน ให้เลือกได้เฉพาะแผนกย่อย (แผนกที่ไม่มีแผนกย่อยซ้อนอีก)
const assignableDepartments = computed(() => {
  return departments.value.filter(d => !departments.value.some(child => child.parentDepartmentId === d.id))
})
const hasUsersWithoutDepartment = computed(() => usersStore.users.some((u) => !u.departmentId))

const hasFilters = computed(() =>
  Boolean(filters.search.trim() || filters.department || filters.role || filters.status || filters.authSource),
)

const filteredUsers = computed(() => {
  const q = filters.search.trim().toLowerCase()
  return usersStore.users.filter((u) => {
    const deptId = u.departmentId
    if (filters.department === NO_DEPARTMENT && deptId) return false
    if (filterDepartmentIds.value && !filterDepartmentIds.value.has(deptId)) return false
    if (filters.role && u.role !== filters.role) return false
    if (filters.status === 'active' && !u.isActive) return false
    if (filters.status === 'inactive' && u.isActive) return false
    if (filters.authSource && u.authSource !== filters.authSource) return false
    if (!q) return true
    return [u.username, u.fullName, u.department, u.phone, u.email].some((v) => v?.toLowerCase().includes(q))
  })
})

function clearFilters() {
  Object.assign(filters, { search: '', department: '', role: '', status: '', authSource: '' })
}

// ----- แบ่งหน้า: หน้าละ 10 คน -----
const PAGE_SIZE = 10
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / PAGE_SIZE)))
const pagedUsers = computed(() => filteredUsers.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const rangeStart = computed(() => (filteredUsers.value.length === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1))
const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, filteredUsers.value.length))

// เปลี่ยนตัวกรอง → กลับไปหน้า 1 (ไม่งั้นอาจค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว)
watch(filters, () => {
  page.value = 1
})
// รายชื่อสั้นลง (เช่น ผู้ใช้ถูกกรองออกหลังแก้ไข) → ไม่ให้ค้างเกินหน้าสุดท้าย
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

async function onToggleActive(user) {
  if (user.isActive && !await confirmDialog(t('admin.confirmDeactivateUser', { name: user.fullName }), { danger: true })) return
  try {
    if (user.isActive) {
      await usersStore.deactivate(user.id)
      toast.success(t('toast.userDeactivated', { name: user.fullName }))
    } else {
      await usersStore.update(user.id, {
        fullName: user.fullName,
        fullNameTh: user.fullNameTh ?? null,
        employeeCode: user.employeeCode ?? null,
        approvalLevel: user.approvalLevel ?? null,
        departmentId: user.departmentId,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isActive: true,
      })
      toast.success(t('toast.userActivated', { name: user.fullName }))
    }
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('admin.users') }}</h1>

    <div class="filter-bar !gap-x-4">
      <div class="min-w-[10rem] flex-1">
        <label for="user-search" class="filter-label">{{ t('admin.filterSearch') }}</label>
        <input
          id="user-search"
          v-model="filters.search"
          type="search"
          :placeholder="t('admin.filterSearchPlaceholder')"
          class="input"
        />
      </div>
      <div>
        <label for="user-filter-department" class="filter-label">
          {{ t('admin.department') }}
        </label>
        <select
          id="user-filter-department"
          v-model="filters.department"
          class="input min-w-[11rem] max-w-[16rem]"
        >
          <option value="">{{ t('admin.filterAll') }}</option>
          <option v-for="dept in departmentFilterOptions" :key="dept.id" :value="dept.id">
            {{ dept.label }}
          </option>
          <option v-if="hasUsersWithoutDepartment" :value="NO_DEPARTMENT">{{ t('admin.filterNoDepartment') }}</option>
        </select>
      </div>
      <div>
        <label for="user-filter-role" class="filter-label">{{ t('admin.role') }}</label>
        <select id="user-filter-role" v-model="filters.role" class="input w-auto">
          <option value="">{{ t('admin.filterAll') }}</option>
          <option value="Employee">{{ t('admin.roleEmployee') }}</option>
          <option value="Supervisor">{{ t('admin.roleSupervisor') }}</option>
          <option value="Admin">{{ t('admin.roleAdmin') }}</option>
        </select>
      </div>
      <div>
        <label for="user-filter-status" class="filter-label">{{ t('admin.status') }}</label>
        <select id="user-filter-status" v-model="filters.status" class="input w-auto">
          <option value="">{{ t('admin.filterAll') }}</option>
          <option value="active">{{ t('admin.active') }}</option>
          <option value="inactive">{{ t('admin.inactive') }}</option>
        </select>
      </div>
      <div>
        <label for="user-filter-source" class="filter-label">{{ t('admin.authSource') }}</label>
        <select id="user-filter-source" v-model="filters.authSource" class="input w-auto">
          <option value="">{{ t('admin.filterAll') }}</option>
          <option value="AD">AD</option>
          <option value="Local">Local</option>
          <option value="None">{{ t('admin.authSourceNone') }}</option>
        </select>
      </div>
      <button
        v-if="hasFilters"
        type="button"
        class="btn btn-secondary"
        @click="clearFilters"
      >
        {{ t('admin.filterClear') }}
      </button>
      <div class="flex flex-wrap gap-2 sm:ml-auto">
        <button type="button" class="btn btn-secondary" @click="showRosterImport = true">
          {{ t('rosterImport.open') }}
        </button>
        <button type="button" class="btn btn-secondary" @click="showAdImport = true">
          {{ t('admin.adImportOpen') }}
        </button>
        <button type="button" class="btn btn-primary" @click="openCreate">
          <AppIcon name="plus" />{{ t('admin.addUser') }}
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th>{{ t('auth.username') }}</th>
            <th>{{ t('admin.employeeCode') }}</th>
            <th>{{ t('admin.fullName') }}</th>
            <th>{{ t('admin.role') }}</th>
            <th>{{ t('admin.authSource') }}</th>
            <th>{{ t('admin.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in pagedUsers" :key="user.id">
            <td class="py-3 font-medium text-slate-900">{{ user.username || '-' }}</td>
            <td class="py-3 font-mono text-xs">{{ user.employeeCode || '-' }}</td>
            <td class="py-3">
              {{ user.fullName }}
              <p v-if="user.department" class="text-xs text-slate-500">{{ user.department }}</p>
            </td>
            <td class="py-3">
              {{ user.role === 'Admin' ? t('admin.roleAdmin') : (user.role === 'Supervisor' ? t('admin.roleSupervisor') : t('admin.roleEmployee')) }}
              <p v-if="user.approvalLevel" class="text-xs text-emerald-700">{{ t('approvals.levelN', { n: user.approvalLevel }) }}</p>
            </td>
            <td class="py-3">{{ user.authSource === 'None' ? t('admin.authSourceNone') : user.authSource }}</td>
            <td class="py-3">
              <span :class="user.isActive ? 'text-green-700' : 'text-slate-400'">
                {{ user.isActive ? t('admin.active') : t('admin.inactive') }}
              </span>
            </td>
            <td class="whitespace-nowrap py-3 text-right">
              <button type="button" class="link-action" @click="startEdit(user)">
                {{ t('common.edit') }}
              </button>
              <button
                type="button"
                class="ml-3 cursor-pointer"
                :class="user.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-700 hover:text-green-900'"
                @click="onToggleActive(user)"
              >
                {{ user.isActive ? t('admin.deactivate') : t('admin.activate') }}
              </button>
            </td>
          </tr>
          <tr v-if="usersStore.users.length > 0 && filteredUsers.length === 0">
            <td colspan="7"><p class="empty-state">{{ t('admin.filterNoMatch') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-xs text-muted" aria-live="polite">
      <template v-if="hasFilters">
        {{ t('admin.filterCountFiltered', { from: rangeStart, to: rangeEnd, shown: filteredUsers.length, total: usersStore.users.length }) }}
      </template>
      <template v-else>
        {{ t('admin.filterCount', { from: rangeStart, to: rangeEnd, total: usersStore.users.length }) }}
      </template>
    </p>
    <PaginationNav v-model:page="page" :page-count="pageCount" class="mt-4" />
    <AdImportModal v-if="showAdImport" @close="showAdImport = false" />
    <RosterImportModal v-if="showRosterImport" @close="showRosterImport = false" />

    <!-- Add / edit user modal -->
    <div
      v-if="isModalOpen"
      class="modal-backdrop"
      @click.self="!isSubmitting && closeModal()"
    >
      <form
        ref="modalEl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-modal-title"
        class="modal-panel max-h-[90vh] max-w-2xl"
        @submit.prevent="onSubmit"
      >
        <div class="modal-header">
          <h2 id="user-modal-title" class="text-base font-bold text-slate-900">
            {{ editingId ? t('admin.editUser') : t('admin.addUser') }}
          </h2>
          <button
            type="button"
            :aria-label="t('common.close')"
            class="cursor-pointer text-slate-400 hover:text-slate-600"
            @click="closeModal"
          >
            <AppIcon name="close" class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto p-5">
          <div v-if="!editingId" class="rounded-control bg-surface p-3">
            <label class="flex cursor-pointer items-start gap-2 text-sm text-ink">
              <input v-model="form.canLogin" type="checkbox" class="mt-0.5" />
              <span>
                {{ t('admin.canLogin') }}
                <span class="block text-xs text-muted">{{ t('admin.canLoginHint') }}</span>
              </span>
            </label>
          </div>
          <p v-else-if="editingAuthSource === 'None'" class="text-xs text-muted">{{ t('admin.noLoginNote') }}</p>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div v-if="form.canLogin">
              <label for="user-username" class="label">{{ t('auth.username') }}</label>
              <input
                id="user-username"
                v-model="form.username"
                type="text"
                :disabled="Boolean(editingId)"
                required
                autocomplete="off"
                class="input"
              />
            </div>
            <div>
              <label for="user-employee-code" class="label">{{ t('admin.employeeCodeLabel') }}</label>
              <input
                id="user-employee-code"
                v-model="form.employeeCode"
                type="text"
                :placeholder="t('admin.employeeCodePlaceholder')"
                class="input"
              />
            </div>
            <div v-if="!editingId && form.canLogin">
              <label for="user-password" class="label">{{ t('auth.password') }}</label>
              <input
                id="user-password"
                v-model="form.password"
                type="password"
                minlength="8"
                required
                autocomplete="new-password"
                class="input"
              />
            </div>
            <div>
              <label for="user-fullname" class="label">{{ t('admin.fullName') }}</label>
              <input
                id="user-fullname"
                v-model="form.fullName"
                type="text"
                :disabled="editingAuthSource === 'AD'"
                required
                class="input"
              />
            </div>
            <div>
              <label for="user-fullname-th" class="label">{{ t('admin.fullNameTh') }}</label>
              <input id="user-fullname-th" v-model="form.fullNameTh" type="text" maxlength="200" class="input" />
            </div>
            <div>
              <label for="user-department" class="label">{{ t('admin.department') }}</label>
              <select
                id="user-department"
                v-model="form.departmentId"
                class="input"
              >
                <option :value="null">{{ t('admin.notSpecified') }}</option>
                <option v-for="dept in assignableDepartments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
              </select>
            </div>
            <div>
              <label for="user-phone" class="label">{{ t('admin.phone') }}</label>
              <input
                id="user-phone"
                v-model="form.phone"
                type="tel"
                maxlength="50"
                class="input"
              />
            </div>
            <div>
              <label for="user-email" class="label">{{ t('admin.email') }}</label>
              <input
                id="user-email"
                v-model="form.email"
                type="email"
                class="input"
              />
            </div>
            <div v-if="form.canLogin">
              <label for="user-role" class="label">{{ t('admin.role') }}</label>
              <select id="user-role" v-model="form.role" class="input">
                <option value="Employee">{{ t('admin.roleEmployee') }}</option>
                <option value="Supervisor">{{ t('admin.roleSupervisor') }}</option>
                <option value="Admin">{{ t('admin.roleAdmin') }}</option>
              </select>
            </div>
            <!-- ระดับผู้อนุมัติคำขอรถไปงานนอก (dev+HR 2026-10-05) - ผู้ขอเลือกผู้อนุมัติจากคนที่มีระดับในแผนกเดียวกัน -->
            <div v-if="form.canLogin">
              <label for="user-approval-level" class="label">{{ t('approvals.levelLabel') }}</label>
              <select id="user-approval-level" v-model="form.approvalLevel" class="input">
                <option value="">{{ t('approvals.levelNone') }}</option>
                <option v-for="n in [1, 2, 3]" :key="n" :value="n">{{ t('approvals.levelN', { n }) }}</option>
              </select>
            </div>
          </div>
          <p v-if="errorCode" role="alert" class="text-sm text-red-600">{{ t(`errors.${errorCode}`) }}</p>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            :disabled="isSubmitting"
            class="btn btn-secondary"
            @click="closeModal"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="btn btn-primary"
          >
            {{ editingId ? t('common.save') : t('admin.addUser') }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
