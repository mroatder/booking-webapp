<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/client'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorCode = ref('')

function toggleShowPassword() {
  showPassword.value = !showPassword.value
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    await auth.login(username.value, password.value)
    // รับเฉพาะ path ภายในแอป (ขึ้นต้น / และไม่ใช่ // หรือ /\) กันลิงก์ login ที่ถูกแต่งให้พาไปเว็บอื่น
    const target = route.query.redirect
    const redirect = typeof target === 'string' && /^\/(?![/\\])/.test(target) ? target : '/'
    router.push(redirect)
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="relative flex min-h-screen flex-col items-center justify-center bg-canvas p-4">
    <div class="absolute top-4 right-4 z-10">
      <LanguageSwitcher />
    </div>

    <div class="w-full max-w-md rounded-card bg-white p-8 sm:p-10">
      <div class="mb-8 text-center">
        <img src="/logo/logo.png" :alt="t('common.logoAlt')" class="mx-auto mb-5 h-14 w-auto object-contain" />
        <h1 class="page-title">{{ t('auth.loginTitle') }}</h1>
        <p class="mt-1 text-sm text-subtle">{{ t('common.appName') }}</p>
      </div>

      <p class="mb-6 flex items-start gap-2.5 rounded-control bg-surface p-3 text-xs text-muted">
        <AppIcon name="lightbulb" class="mt-0.5 text-ink" />
        <span>{{ t('auth.loginHint') }}</span>
      </p>

      <form class="no-required-note space-y-4" novalidate @submit.prevent="onSubmit">
        <div>
          <label for="username" class="label">{{ t('auth.username') }}</label>
          <div class="relative flex items-center">
            <AppIcon name="user" class="pointer-events-none absolute left-3 text-subtle" />
            <input
              id="username"
              v-model="username"
              type="text"
              autocomplete="username"
              required
              class="input pl-9"
            />
          </div>
        </div>

        <div>
          <label for="password" class="label">{{ t('auth.password') }}</label>
          <div class="relative flex items-center">
            <AppIcon name="lockClosed" class="pointer-events-none absolute left-3 text-subtle" />
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              class="input pr-10 pl-9"
            />
            <button
              type="button"
              class="icon-btn absolute right-1"
              :class="showPassword ? 'text-ink' : ''"
              :aria-pressed="showPassword"
              :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
              @click="toggleShowPassword"
            >
              <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" />
            </button>
          </div>
        </div>

        <p v-if="errorCode" role="alert" class="text-sm text-danger">
          {{ t(`errors.${errorCode}`) }}
        </p>

        <button type="submit" :disabled="isSubmitting" class="btn btn-primary mt-2 w-full py-2.5">
          {{ isSubmitting ? t('common.loading') : t('auth.loginButton') }}
        </button>
      </form>
    </div>
  </div>
</template>
