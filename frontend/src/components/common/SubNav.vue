<script setup>
// เมนูย่อยใต้ header - ทุกกลุ่มหน้า (admin / จองห้อง / ขอรถ) ต้องใช้ component นี้เท่านั้น (docs/UI-STYLE.md § เมนูย่อย)
// items: [{ to, label, icon, names?: string[], show?: boolean, badge?: number }]
//   badge = จำนวนงานรอดำเนินการ (แสดงเป็นตัวเลขท้ายชื่อเมื่อ > 0)
//   icon  = ชื่อไอคอนใน AppIcon (บังคับทุกรายการ เพื่อให้หน้าตาเหมือนกันทั้งระบบ)
//   names = ชื่อ route ที่นับว่ารายการนี้ "เปิดอยู่" (ไม่ใส่ = เทียบกับ to)
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  items: { type: Array, required: true },
})

const route = useRoute()
const visible = computed(() => props.items.filter((i) => i.show !== false))

function isActive(item) {
  if (item.names) return item.names.includes(route.name)
  return route.path === item.to
}
</script>

<template>
  <nav :class="['subnav', { 'subnav-dense': visible.length > 6 }]">
    <div class="page-bar flex flex-wrap">
      <RouterLink
        v-for="item in visible"
        :key="item.to"
        :to="item.to"
        :class="['subnav-link', { 'is-active': isActive(item) }]"
        :aria-current="isActive(item) ? 'page' : undefined"
      >
        <AppIcon :name="item.icon" />
        {{ item.label }}
        <span v-if="item.badge > 0" class="count-badge">{{ item.badge }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
