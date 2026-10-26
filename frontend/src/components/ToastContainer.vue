<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const toast = useToastStore()
</script>

<template>
  <!-- ใต้แถบเมนู (sticky header สูง ~57px) มุมขวาบน; บนมือถือกว้างเต็มจอ -->
  <div
    class="pointer-events-none fixed inset-x-4 top-20 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-96"
    aria-live="polite"
  >
    <TransitionGroup
      enter-from-class="translate-y-2 opacity-0"
      enter-active-class="transition duration-200 ease-out"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
    >
      <div
        v-for="item in toast.toasts"
        :key="item.id"
        :role="item.type === 'error' ? 'alert' : 'status'"
        :class="[
          'pointer-events-auto flex w-full items-start gap-3 rounded-control border px-4 py-3 text-sm shadow-lg',
          item.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800',
        ]"
      >
        <AppIcon :name="item.type === 'error' ? 'exclamation' : 'checkCircle'" class="mt-px h-5 w-5" />
        <span class="flex-1">{{ item.message }}</span>
        <button
          type="button"
          :aria-label="t('common.close')"
          class="cursor-pointer opacity-60 hover:opacity-100"
          @click="toast.dismiss(item.id)"
        >
          <AppIcon name="close" class="h-5 w-5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
