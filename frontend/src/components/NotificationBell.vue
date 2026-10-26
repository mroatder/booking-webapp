<script setup>
// กระดิ่งแจ้งเตือนบน header หลัก - แสดงจำนวนงานที่รอฉันดำเนินการ กดแล้วเห็นรายการพร้อมลิงก์ไปหน้านั้น
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAlertsStore } from '@/stores/alerts'
import AppIcon from '@/components/common/AppIcon.vue'

const { t } = useI18n()
const alerts = useAlertsStore()
const open = ref(false)
const root = ref(null)

const entries = computed(() =>
  [
    { to: '/requests/vehicles/approvals', label: t('alerts.approvals'), count: alerts.approvals },
    { to: '/requests/vehicles/manage', label: t('alerts.vehicleManage'), count: alerts.vehicleManage },
  ].filter((e) => e.count > 0),
)

function toggle() {
  open.value = !open.value
  if (open.value) alerts.refresh()
}

function onDocClick(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
function onKey(e) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="icon-btn relative"
      :title="t('alerts.title')"
      :aria-label="t('alerts.title')"
      :aria-expanded="open"
      @click="toggle"
    >
      <AppIcon name="bell" />
      <span v-if="alerts.total > 0" class="count-badge count-badge-float">{{ alerts.total > 99 ? '99+' : alerts.total }}</span>
    </button>
    <div v-if="open" class="notice-menu">
      <p v-if="entries.length === 0" class="px-4 py-3 text-sm text-subtle">{{ t('alerts.empty') }}</p>
      <RouterLink
        v-for="e in entries"
        :key="e.to"
        :to="e.to"
        class="notice-item"
        @click="open = false"
      >
        <span>{{ e.label }}</span>
        <span class="count-badge">{{ e.count }}</span>
      </RouterLink>
    </div>
  </div>
</template>
