<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { ApiError } from '@/api/client'

// โปรไฟล์ของฉัน - แก้ได้เฉพาะเบอร์โทรและอีเมล (ไม่ดึงจาก AD ผู้ใช้กรอกเอง), ข้อมูลอื่นแสดงอย่างเดียว
const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

// ลายเซ็น/ตรา (เฉพาะผู้มีระดับอนุมัติ) - อัปโหลดครั้งเดียว ระบบใส่ให้ในแบบฟอร์มขอใช้รถที่อนุมัติ
// ไฟล์ DocuWorks ใช้ตรงไม่ได้ → บันทึกตรา/ลายเซ็นเป็นรูป PNG/JPG (พื้นหลังโปร่งใสจะดูดีที่สุด)
const signatureInput = ref(null)
const signatureVersion = ref(Date.now())
const signatureBusy = ref(false)
const signatureError = ref('')

async function onSignaturePicked(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  signatureError.value = ''
  signatureBusy.value = true
  try {
    await auth.uploadMySignature(file)
    signatureVersion.value = Date.now()
    toast.success(t('profile.signatureSaved'))
  } catch (err) {
    signatureError.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    signatureBusy.value = false
  }
}

async function onSignatureDelete() {
  signatureError.value = ''
  signatureBusy.value = true
  try {
    await auth.deleteMySignature()
    toast.success(t('profile.signatureDeleted'))
  } catch (err) {
    signatureError.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    signatureBusy.value = false
  }
}

const phone = ref('')
const email = ref('')
const errorCode = ref('')
const isSaving = ref(false)

watch(
  () => auth.user?.phone,
  (value) => {
    phone.value = value ?? ''
  },
  { immediate: true },
)
watch(
  () => auth.user?.email,
  (value) => {
    email.value = value ?? ''
  },
  { immediate: true },
)

const isUnchanged = () =>
  phone.value.trim() === (auth.user?.phone ?? '') && email.value.trim() === (auth.user?.email ?? '')

async function onSave() {
  errorCode.value = ''
  isSaving.value = true
  try {
    if (phone.value.trim() !== (auth.user?.phone ?? '')) await auth.updateMyPhone(phone.value)
    if (email.value.trim() !== (auth.user?.email ?? '')) await auth.updateMyEmail(email.value)
    toast.success(t('profile.saved'))
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section class="page-container py-8">
    <h1 class="page-title mb-6">{{ t('profile.title') }}</h1>

    <div class="max-w-2xl space-y-8">
      <dl class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt class="text-xs font-medium text-slate-500">{{ t('auth.username') }}</dt>
          <dd class="mt-0.5 text-sm text-slate-900">{{ auth.user?.username }}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">{{ t('admin.fullName') }}</dt>
          <dd class="mt-0.5 text-sm text-slate-900">{{ auth.user?.fullName }}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">{{ t('admin.department') }}</dt>
          <dd class="mt-0.5 text-sm text-slate-900">{{ auth.user?.department || '-' }}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">{{ t('admin.role') }}</dt>
          <dd class="mt-0.5 text-sm text-slate-900">
            {{ auth.user?.role === 'Admin' ? t('admin.roleAdmin') : (auth.user?.role === 'Supervisor' ? t('admin.roleSupervisor') : t('admin.roleEmployee')) }}
            <span v-if="auth.user?.approvalLevel" class="text-emerald-700"> • {{ t('approvals.levelN', { n: auth.user.approvalLevel }) }}</span>
          </dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">{{ t('admin.authSource') }}</dt>
          <dd class="mt-0.5 text-sm text-slate-900">{{ auth.user?.authSource }}</dd>
        </div>
      </dl>
      <p v-if="auth.user?.authSource === 'AD'" class="-mt-4 text-xs text-slate-500">
        {{ t('profile.adNote') }}
      </p>

      <form class="space-y-3" @submit.prevent="onSave">
        <div>
          <label for="profile-phone" class="label">{{ t('admin.phone') }}</label>
          <p class="mb-2 text-xs text-slate-500">{{ t('profile.phoneHint') }}</p>
          <input
            id="profile-phone"
            v-model="phone"
            type="tel"
            maxlength="50"
            class="input max-w-xs"          />
        </div>
        <div>
          <label for="profile-email" class="label">{{ t('admin.email') }}</label>
          <p class="mb-2 text-xs text-slate-500">{{ t('profile.emailHint') }}</p>
          <input
            id="profile-email"
            v-model="email"
            type="email"
            maxlength="255"
            class="input max-w-xs"
          />
        </div>
        <p v-if="errorCode" role="alert" class="text-sm text-red-600">{{ t(`errors.${errorCode}`) }}</p>
        <button
          type="submit"
          :disabled="isSaving || isUnchanged()"
          class="btn btn-primary"
        >
          {{ t('common.save') }}
        </button>
      </form>

      <div v-if="auth.user?.approvalLevel" class="space-y-3">
        <div>
          <p class="text-sm font-medium text-slate-700">{{ t('profile.signature') }}</p>
          <p class="mt-1 text-xs text-slate-500">{{ t('profile.signatureHint') }}</p>
        </div>
        <div class="flex h-24 w-64 items-center justify-center rounded-control border border-dashed border-slate-300 bg-slate-50">
          <img
            v-if="auth.user.hasSignature"
            :src="`/api/users/${auth.user.id}/signature?v=${signatureVersion}`"
            :alt="t('profile.signature')"
            class="max-h-20 max-w-60 object-contain"
          />
          <span v-else class="text-xs text-slate-400">{{ t('profile.noSignature') }}</span>
        </div>
        <input ref="signatureInput" type="file" accept="image/png,image/jpeg" class="hidden" @change="onSignaturePicked" />
        <p v-if="signatureError" role="alert" class="text-sm text-red-600">{{ t(`errors.${signatureError}`) }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="signatureBusy"
            class="btn btn-secondary"
            @click="signatureInput?.click()"
          >
            {{ auth.user.hasSignature ? t('profile.replaceSignature') : t('profile.uploadSignature') }}
          </button>
          <button
            v-if="auth.user.hasSignature"
            type="button"
            :disabled="signatureBusy"
            class="btn btn-secondary text-red-700"
            @click="onSignatureDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
