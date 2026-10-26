<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// แถบเปลี่ยนหน้า: ก่อนหน้า / เลขหน้า / ถัดไป - ถ้าหน้าเยอะจะย่อด้วย "…" (แสดงหน้าแรก หน้าสุดท้าย และรอบหน้าปัจจุบัน)
const props = defineProps({
  page: { type: Number, required: true }, // เริ่มที่ 1
  pageCount: { type: Number, required: true },
})
const emit = defineEmits(['update:page'])
const { t } = useI18n()

const items = computed(() => {
  const { page, pageCount } = props
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount))
  const pages = [...wanted].sort((a, b) => a - b)
  const out = []
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push({ gap: true, key: `gap-${p}` })
    out.push({ page: p, key: p })
  })
  return out
})

function go(p) {
  if (p >= 1 && p <= props.pageCount && p !== props.page) emit('update:page', p)
}

const buttonClass =
  'btn btn-sm min-w-9'
</script>

<template>
  <nav v-if="pageCount > 1" :aria-label="t('pagination.label')" class="flex flex-wrap items-center justify-center gap-1.5">
    <button
      type="button"
      :disabled="page <= 1"
      :class="[buttonClass, 'btn-secondary']"
      @click="go(page - 1)"
    >
      {{ t('pagination.prev') }}
    </button>
    <template v-for="item in items" :key="item.key">
      <span v-if="item.gap" class="px-1 text-sm text-subtle">…</span>
      <button
        v-else
        type="button"
        :aria-current="item.page === page ? 'page' : undefined"
        :class="[
          buttonClass,
          item.page === page
            ? 'btn-primary'
            : 'btn-secondary',
        ]"
        @click="go(item.page)"
      >
        {{ item.page }}
      </button>
    </template>
    <button
      type="button"
      :disabled="page >= pageCount"
      :class="[buttonClass, 'btn-secondary']"
      @click="go(page + 1)"
    >
      {{ t('pagination.next') }}
    </button>
  </nav>
</template>
