<script setup lang="ts">
import Swal from 'sweetalert2'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { RouteConstant } from '@/constants/routeConstant'
import type Vehicle from '@/interfaces/Vehicle'
import { editVehicleById, getVehicleByNumberPlate } from '@/services/VehicleService'
import { generateCurrentTime } from '@/utils/dateUtils'

const items = ['Van', 'Minibus']

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const isActive = ref(true)
const vehicle = ref<Vehicle>({
  id: null,
  numberPlate: '',
  type: '',
  totalSeating: 0,
  status: '',
  requestedBy: '',
  requestedDate: ''
})

const fetchVehicle = async () => {
  try {
    const numberPlate = route.params.id as string

    vehicle.value = await getVehicleByNumberPlate(numberPlate)
    loading.value = false
  } catch (error) {
    Swal.fire('Oops!', "Seems like we couldn't fetch the info", 'error')
  }
}

const updateVehicle = () => {
  try {
    vehicle.value.requestedDate = generateCurrentTime()
    editVehicleById(vehicle.value)
    goBack()
  } catch (error) {
    Swal.fire('Oops!', "Seems like we couldn't fetch the info", 'error')
  }
}

const vehiclePage = RouteConstant.Layout.OFFICER + RouteConstant.VEHICLE

const goBack = () => router.push(vehiclePage)

const selectItem = (item: string) => {
  vehicle.value.type = item
}

const toggleActive = () => {
  isActive.value = !isActive.value
  vehicle.value.status = isActive.value ? 'Active' : 'Inactive'
}

onMounted(() => {
  fetchVehicle()
})
</script>

<template>
  <div>
    <h2>{{ route.params.id }}</h2>
  </div>
  <div v-if="loading">Loading...</div>
  <div v-else>
    <div>
      <span>ทะเบียนรถ</span>
      <input type="text" v-model="vehicle.numberPlate" />
    </div>
    <div>
      <label for="type">ประเภทรถโดยสาร</label>
      <div class="dropdown">
        <button
          id="type"
          class="btn btn-secondary dropdown-toggle"
          type="button"
          data-bs-toggle="dropdown"
          aria-expanded="false"
        >
          {{ vehicle.type }}
        </button>
        <ul class="dropdown-menu">
          <li v-for="(item, index) in items" :key="index">
            <span class="dropdown-item" @click="selectItem(item)">{{ item }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div>
      <span>ความจุที่นั่ง</span>
      <input type="text" v-model="vehicle.totalSeating" />
    </div>
    <div>
      <label class="form-check-label" for="status">สถานะ</label>
      <div class="form-check form-switch">
        <input
          class="form-check-input"
          type="checkbox"
          id="status"
          v-model="isActive"
          @click="toggleActive"
        />
        <label class="form-check-label">
          {{ isActive ? 'Active' : 'Inactive' }}
        </label>
      </div>
    </div>
  </div>
  <div>
    <button @click="goBack" class="btn btn-danger">ยกเลิก</button>
    <button @click="updateVehicle" class="btn btn-success">ยืนยัน</button>
  </div>
</template>
