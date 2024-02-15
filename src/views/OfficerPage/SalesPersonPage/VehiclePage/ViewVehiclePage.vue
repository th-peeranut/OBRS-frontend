<script setup lang="ts">
import Swal from 'sweetalert2'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { RouteConstant } from '@/constants/routeConstant'
import type Vehicle from '@/interfaces/Vehicle'
import { getVehicleByNumberPlate } from '@/services/VehicleService'

const route = useRoute()

const loading = ref(true)
const vehicle = ref<Vehicle>({
  id: null,
  numberPlate: '',
  type: '',
  totalSeating: 0,
  status: '',
  requestedBy: '',
  requestedDate: ''
})

const vehiclePage = RouteConstant.Layout.OFFICER + RouteConstant.VEHICLE
const formattedURL = (originalURL: string, numberPlate: string) =>
  originalURL.replace(':id', numberPlate)

const fetchVehicle = async () => {
  try {
    const numberPlate = route.params.id as string

    vehicle.value = await getVehicleByNumberPlate(numberPlate)
    loading.value = false
  } catch (error) {
    Swal.fire('Oops!', "Seems like we couldn't fetch the info", 'error')
  }
}

onMounted(() => {
  fetchVehicle()
})
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else>
    <div>
      <h2>{{ vehicle?.numberPlate }}</h2>
    </div>
    <div>
      <router-link :to="{ path: `${vehiclePage}` }" class="btn btn-primary">ย้อนกลับ</router-link>
      <router-link
        :to="{
          path: `${formattedURL(vehiclePage + RouteConstant.Action.EDIT, vehicle.numberPlate)}`
        }"
        class="btn btn-primary"
        >แก้ไข</router-link
      >
    </div>
    <div>
      <span>ทะเบียนรถ</span>
      <input type="text" disabled :value="vehicle?.numberPlate" />
    </div>
    <div>
      <span>ประเภทรถโดยสาร</span>
      <input type="text" disabled :value="vehicle?.type" />
    </div>
    <div>
      <span>ความจุที่นั่ง</span>
      <input type="text" disabled :value="vehicle?.totalSeating" />
    </div>
    <div>
      <span>สถานะ</span>
      <input type="text" disabled :value="vehicle?.status" />
    </div>
  </div>
</template>
