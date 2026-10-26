<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { confirmState, acceptConfirm, dismissConfirm } from '@/utils/confirm'

const { t } = useI18n()
const okBtn = ref(null)
const valueInput = ref(null)

// โฟกัสปุ่มตกลง (หรือเลือกข้อความที่ต้องคัดลอก) เมื่อเปิด เพื่อให้ Enter/Esc ใช้งานได้
watch(
  () => confirmState.open,
  async (open) => {
    if (!open) return
    await nextTick()
    if (valueInput.value) valueInput.value.select()
    else okBtn.value?.focus()
  },
)
</script>

<template>
  <div
    v-if="confirmState.open"
    class="modal-backdrop z-[70]"
    @click.self="dismissConfirm"
    @keydown.esc="dismissConfirm"
  >
    <div class="modal-panel max-w-md" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <div id="confirm-title" class="modal-header">{{ confirmState.title || t('common.confirmTitle') }}</div>
      <div class="modal-body">
        <p id="confirm-message" class="whitespace-pre-line text-sm text-ink">{{ confirmState.message }}</p>
        <input v-if="confirmState.value" ref="valueInput" class="input" type="text" readonly :value="confirmState.value" />
      </div>
      <div class="modal-footer">
        <button v-if="!confirmState.value" type="button" class="btn btn-secondary" @click="dismissConfirm">
          {{ t('common.cancel') }}
        </button>
        <button
          ref="okBtn"
          type="button"
          :class="['btn', confirmState.danger ? 'btn-danger' : 'btn-primary']"
          @click="acceptConfirm"
        >
          {{ confirmState.okLabel || t('common.ok') }}
        </button>
      </div>
    </div>
  </div>
</template>
