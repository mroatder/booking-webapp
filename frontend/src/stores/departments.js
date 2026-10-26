import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'

export const useDepartmentsStore = defineStore('departments', () => {
  const departments = ref([])

  async function fetchAll() {
    const res = await api.get('/departments')
    departments.value = res
  }

  async function create(payload) {
    const res = await api.post('/departments', payload)
    departments.value.push(res)
    departments.value.sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'th'))
    return res
  }

  async function update(id, payload) {
    const res = await api.put(`/departments/${id}`, payload)
    const index = departments.value.findIndex(d => d.id === id)
    if (index !== -1) {
      departments.value[index] = res
      departments.value.sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'th'))
    }
    return res
  }

  async function remove(id) {
    await api.delete(`/departments/${id}`)
    departments.value = departments.value.filter(d => d.id !== id)
  }

  return { departments, fetchAll, create, update, remove }
})
