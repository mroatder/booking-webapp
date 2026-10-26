<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsersStore } from '@/stores/users'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import { downloadFile } from '@/utils/download'

// นำเข้ารายชื่อพนักงานที่ไม่ login จากไฟล์ Excel: เลือกไฟล์ → ตรวจ (preview) → ยืนยันนำเข้าเฉพาะแถวที่ผ่าน
const emit = defineEmits(['close'])
const { t } = useI18n()
const usersStore = useUsersStore()
const toast = useToastStore()

// ไฟล์ตัวอย่างสร้างสดที่ backend - รายชื่อแผนกตรงกับในระบบ ณ ตอนที่กดดาวน์โหลด
const TEMPLATE_URL = '/api/users/import-roster/template'
const isDownloading = ref(false)
async function downloadTemplate() {
  isDownloading.value = true
  try {
    await downloadFile(TEMPLATE_URL, 'employee-import-template.xlsx')
  } catch {
    toast.error(t('errors.GENERIC'))
  } finally {
    isDownloading.value = false
  }
}
const file = ref(null)
const preview = ref(null) // { rows, summary }
const isBusy = ref(false)
const errorCode = ref('')
const errorDetails = ref(null)
const done = ref(false)
const fileInput = ref(null)

const hasValidRows = computed(() => (preview.value?.summary.valid ?? 0) > 0)

async function onFileChange(event) {
  const picked = event.target.files?.[0]
  preview.value = null
  errorCode.value = ''
  done.value = false
  file.value = picked ?? null
  if (!picked) return
  isBusy.value = true
  try {
    preview.value = await usersStore.previewRoster(picked)
  } catch (err) {
    errorCode.value = errorCodeOf(err)
    errorDetails.value = err.details ?? null
  } finally {
    isBusy.value = false
  }
}

async function onImport() {
  errorCode.value = ''
  isBusy.value = true
  try {
    const result = await usersStore.importRoster(file.value)
    preview.value = result
    done.value = true
    toast.success(t('rosterImport.toastDone', { n: result.imported }))
  } catch (err) {
    errorCode.value = errorCodeOf(err)
    errorDetails.value = err.details ?? null
  } finally {
    isBusy.value = false
  }
}

function reset() {
  file.value = null
  preview.value = null
  done.value = false
  errorCode.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function onKeydown(event) {
  if (event.key === 'Escape' && !isBusy.value) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="modal-backdrop" @click.self="!isBusy && emit('close')">
    <div role="dialog" aria-modal="true" aria-labelledby="roster-import-title" class="modal-panel max-h-[90vh] max-w-4xl">
      <div class="modal-header">
        <div>
          <h2 id="roster-import-title" class="text-base font-bold text-ink">{{ t('rosterImport.title') }}</h2>
          <p class="text-xs text-subtle">{{ t('rosterImport.hint') }}</p>
        </div>
        <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="emit('close')">
          <AppIcon name="close" class="h-5 w-5" />
        </button>
      </div>

      <div class="modal-body flex-1 space-y-4 overflow-y-auto">
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-0 flex-1">
            <label for="roster-file" class="label">{{ t('rosterImport.file') }}</label>
            <input
              id="roster-file"
              ref="fileInput"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              :disabled="isBusy || done"
              class="input"
              @change="onFileChange"
            />
          </div>
          <button type="button" class="btn btn-secondary" :disabled="isDownloading" @click="downloadTemplate">
            <AppIcon name="download" class="mr-1 h-4 w-4" /> {{ t('rosterImport.downloadTemplate') }}
          </button>
        </div>

        <p v-if="errorCode" role="alert" class="text-sm text-danger">
          {{ t(`errors.${errorCode}`, { max: errorDetails?.max }) }}
        </p>
        <p v-else-if="isBusy" class="text-sm text-subtle">{{ t('common.loading') }}</p>
        <p v-else-if="!preview" class="text-sm text-subtle">{{ t('rosterImport.pickFile') }}</p>

        <template v-if="preview">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="chip">{{ t('rosterImport.total', { n: preview.summary.total }) }}</span>
            <span class="chip chip-accent">{{ t('rosterImport.valid', { n: preview.summary.valid }) }}</span>
            <span v-if="preview.summary.invalid" class="chip text-danger">{{ t('rosterImport.invalid', { n: preview.summary.invalid }) }}</span>
          </div>
          <p v-if="done" class="text-sm font-medium text-ink">
            <AppIcon name="checkCircle" class="mr-1 inline h-4 w-4" /> {{ t('rosterImport.imported', { n: preview.imported }) }}
          </p>
          <p v-else-if="preview.summary.invalid" class="text-xs text-subtle">{{ t('rosterImport.skipNote') }}</p>

          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>{{ t('rosterImport.colRow') }}</th>
                  <th>{{ t('admin.employeeCode') }}</th>
                  <th>{{ t('rosterImport.colNameEn') }}</th>
                  <th>{{ t('admin.fullNameTh') }}</th>
                  <th>{{ t('admin.department') }}</th>
                  <th>{{ t('admin.phone') }}</th>
                  <th>{{ t('admin.email') }}</th>
                  <th>{{ t('rosterImport.colResult') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in preview.rows" :key="r.row">
                  <td class="text-subtle">{{ r.row }}</td>
                  <td>{{ r.employeeCode }}</td>
                  <td>{{ r.fullName }}</td>
                  <td>{{ r.fullNameTh }}</td>
                  <td>{{ r.department }}</td>
                  <td>{{ r.phone }}</td>
                  <td>{{ r.email }}</td>
                  <td>
                    <span v-if="r.errors.length === 0" class="text-ink">
                      <AppIcon name="check" class="inline h-4 w-4" /> {{ t('rosterImport.ok') }}
                    </span>
                    <ul v-else class="text-xs text-danger">
                      <li v-for="e in r.errors" :key="e">{{ t(`rosterImport.err.${e}`) }}</li>
                    </ul>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>

      <div class="modal-footer">
        <button v-if="preview && !done" type="button" :disabled="isBusy" class="btn btn-secondary" @click="reset">
          {{ t('rosterImport.chooseOther') }}
        </button>
        <button type="button" :disabled="isBusy" class="btn btn-secondary" @click="emit('close')">{{ t('common.close') }}</button>
        <button v-if="!done" type="button" :disabled="!hasValidRows || isBusy" class="btn btn-primary" @click="onImport">
          {{ t('rosterImport.importButton', { n: preview?.summary.valid ?? 0 }) }}
        </button>
      </div>
    </div>
  </div>
</template>
