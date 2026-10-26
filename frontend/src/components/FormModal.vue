<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

// modal ฟอร์มเพิ่ม/แก้ไขแบบใช้ซ้ำ - parent ใช้ v-if เปิด/ปิด แล้วใส่ช่องกรอกใน slot
// ปิดได้ด้วย Esc / คลิกพื้นหลัง / ปุ่มยกเลิก (ยกเว้นระหว่างกำลังบันทึก), เปิดแล้วโฟกัสช่องแรกที่แก้ได้
const props = defineProps({
  title: { type: String, required: true },
  submitLabel: { type: String, required: true },
  submitting: { type: Boolean, default: false },
  // ปิดเฉพาะปุ่มบันทึก (เช่น ยังเลือกไม่ครบ) - ต่างจาก submitting ที่ล็อกการปิด modal ด้วย
  submitDisabled: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  // บอกเหตุผลข้างปุ่มบันทึกเมื่อกดไม่ได้ (เช่น "เลือกคนขับ")
  submitHint: { type: String, default: '' },
  maxWidth: { type: String, default: 'max-w-lg' },
})
const emit = defineEmits(['submit', 'close'])
const { t } = useI18n()
const formEl = ref(null)

function close() {
  if (!props.submitting) emit('close')
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await nextTick()
  formEl.value?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="modal-backdrop" @click.self="close">
    <form
      ref="formEl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-modal-title"
      :class="['modal-panel max-h-[90vh]', maxWidth]"
      @submit.prevent="emit('submit')"
    >
      <div class="modal-header">
        <h2 id="form-modal-title">{{ title }}</h2>
        <button
          type="button"
          :aria-label="t('common.close')"
          class="icon-btn"
          @click="close"
        >
          <AppIcon name="close" />
        </button>
      </div>

      <div class="modal-body flex-1 overflow-y-auto">
        <slot />
        <p v-if="errorMessage" role="alert" class="text-sm text-danger">{{ errorMessage }}</p>
      </div>

      <div class="modal-footer">
        <p v-if="submitDisabled && submitHint" class="mr-auto self-center text-xs text-muted">{{ submitHint }}</p>
        <button
          type="button"
          :disabled="submitting"
          class="btn btn-secondary"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="submit"
          :disabled="submitting || submitDisabled"
          class="btn btn-primary"
        >
          {{ submitLabel }}
        </button>
      </div>
    </form>
  </div>
</template>
