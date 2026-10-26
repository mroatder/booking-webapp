<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// แถบเปลี่ยนหน้า - v-model:page (เริ่มที่ 1), ซ่อนตัวเองถ้ามีแค่หน้าเดียว
const props = defineProps({
  page: { type: Number, required: true },
  total: { type: Number, required: true },
  pageSize: { type: Number, required: true },
})
const emit = defineEmits(['update:page'])
const { t } = useI18n()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.total, props.page * props.pageSize))

// แสดงเลขหน้าไม่เกิน 5 ปุ่มรอบหน้าปัจจุบัน
const pages = computed(() => {
  const count = Math.min(5, pageCount.value)
  const start = Math.min(Math.max(1, props.page - 2), pageCount.value - count + 1)
  return Array.from({ length: count }, (_, i) => start + i)
})

function go(p) {
  if (p >= 1 && p <= pageCount.value && p !== props.page) emit('update:page', p)
}

const buttonClass = (active, disabled) => [
  'min-w-9 rounded-control border px-2.5 py-1.5 text-sm font-medium transition-colors',
  active
    ? 'border-slate-900 bg-accent text-white'
    : disabled
      ? 'cursor-not-allowed border-slate-200 text-slate-300'
      : 'cursor-pointer border-slate-300 text-slate-700 hover:bg-slate-50',
]
</script>

<template>
  <nav v-if="pageCount > 1" class="flex flex-wrap items-center justify-between gap-3" :aria-label="t('pagination.label')">
    <p class="text-sm text-slate-500">{{ t('pagination.showing', { from, to, total }) }}</p>
    <div class="flex items-center gap-1">
      <button type="button" :class="buttonClass(false, page === 1)" :disabled="page === 1" @click="go(page - 1)">
        ‹ {{ t('pagination.prev') }}
      </button>
      <button
        v-for="p in pages"
        :key="p"
        type="button"
        :class="buttonClass(p === page, false)"
        :aria-current="p === page ? 'page' : undefined"
        @click="go(p)"
      >
        {{ p }}
      </button>
      <button
        type="button"
        :class="buttonClass(false, page === pageCount)"
        :disabled="page === pageCount"
        @click="go(page + 1)"
      >
        {{ t('pagination.next') }} ›
      </button>
    </div>
  </nav>
</template>
