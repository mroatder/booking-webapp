<script setup>
import { useI18n } from 'vue-i18n'
import { setLocale, SUPPORTED_LOCALES } from '@/locales'

const { locale, t } = useI18n()

const labels = { th: 'ไทย', en: 'EN' }
</script>

<template>
  <div class="seg" role="group" :aria-label="t('common.language')">
    <button
      v-for="code in SUPPORTED_LOCALES"
      :key="code"
      type="button"
      class="seg-btn"
      :aria-pressed="locale === code"
      @click="setLocale(code)"
    >
      {{ labels[code] }}
    </button>
  </div>
</template>
