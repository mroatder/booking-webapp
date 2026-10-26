<script setup>
import { ref, markRaw, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFleetStore } from '@/stores/fleet'
import DriversPanel from '@/components/fleet/DriversPanel.vue'
import VehiclesPanel from '@/components/fleet/VehiclesPanel.vue'
import ProvidersPanel from '@/components/fleet/ProvidersPanel.vue'

// หน้า "คนขับและรถ": คนขับ / รถ / ผู้ให้บริการรถ (สายรถรับส่ง + ตารางงานคนขับย้ายไปเมนูจองรถแล้ว)
const { t } = useI18n()
const fleet = useFleetStore()

const sections = ['drivers', 'vehicles', 'providers']
const active = ref('drivers')
const panels = { drivers: markRaw(DriversPanel), vehicles: markRaw(VehiclesPanel), providers: markRaw(ProvidersPanel) }

// ช่อง "เจ้าของ" ในฟอร์มคนขับ/รถ ต้องรู้รายชื่อบริษัทรถเช่า
onMounted(() => {
  fleet.fetchProviders()
  fleet.fetchShuttleRoutes() // ช่อง "สายรถ" ในฟอร์มรถ (VehiclesPanel)
})
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('admin.drivers') }}</h1>

    <component :is="panels[active]">
      <template #lead>
        <div class="seg">
          <button
            v-for="s in sections"
            :key="s"
            type="button"
            :aria-pressed="active === s"
            :class="[
              'seg-btn',
              active === s ? 'is-active' : '',
            ]"
            @click="active = s"
          >
            {{ t(`fleet.section.${s}`) }}
          </button>
        </div>
      </template>
    </component>
  </section>
</template>
