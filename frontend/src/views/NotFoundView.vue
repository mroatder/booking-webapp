<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="mx-auto max-w-md px-4 py-24 text-center">
    <p class="text-sm font-semibold text-slate-400">404</p>
    <h1 class="mt-2 text-xl font-semibold text-slate-900">{{ t('errors.NOT_FOUND') }}</h1>
  </section>
</template>
