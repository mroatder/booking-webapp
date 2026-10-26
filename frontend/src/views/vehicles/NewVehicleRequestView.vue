<script setup>
const props = defineProps({
  requestType: { type: String, required: true }
})

import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useVehicleRequestsStore } from '@/stores/vehicleRequests'
import { useToastStore } from '@/stores/toast'
import VehicleRequestForm from '@/components/VehicleRequestForm.vue'

const { t } = useI18n()
const router = useRouter()
const store = useVehicleRequestsStore()
const toast = useToastStore()

async function onSave(payload) {
  await store.create({ ...payload, requestType: props.requestType })
  toast.success(t('vehicleBooking.submitted'))
  router.push({ name: 'vehicle-request-mine' })
}
</script>

<template>
  <section>
    <h1 class="sr-only">
      {{ requestType === 'BusinessTrip' ? t('nav.requestOutside') : t('nav.requestShuttle') }}
    </h1>
    <VehicleRequestForm :submit-label="t('vehicleBooking.submit')" :on-save="onSave" :request-type="requestType" />
  </section>
</template>
