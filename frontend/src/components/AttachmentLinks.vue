<script setup>
import { attachmentUrl, formatFileSize } from '@/utils/attachments'

// รายการไฟล์แบบฟอร์มขอรถ - เปิดในแท็บใหม่ (backend ตรวจสิทธิ์: เจ้าของคำขอหรือ Admin เท่านั้น)
defineProps({
  requestId: { type: Number, required: true },
  attachments: { type: Array, required: true },
})
</script>

<template>
  <ul v-if="attachments.length" class="flex flex-wrap gap-1.5">
    <li v-for="a in attachments" :key="a.id">
      <a
        :href="attachmentUrl(requestId, a.id)"
        target="_blank"
        rel="noopener noreferrer"
        :title="`${a.name} (${formatFileSize(a.size)})`"
        class="inline-flex max-w-[14rem] items-center gap-1 rounded-control border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:border-slate-400 hover:text-slate-900"
      >
        <span
          :class="[
            'shrink-0 rounded-control px-1 text-xs font-bold uppercase',
            a.contentType === 'application/pdf' ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-sky-700',
          ]"
        >
          {{ a.contentType === 'application/pdf' ? 'PDF' : a.contentType === 'image/png' ? 'PNG' : 'JPG' }}
        </span>
        <span class="truncate">{{ a.name }}</span>
      </a>
    </li>
  </ul>
</template>
