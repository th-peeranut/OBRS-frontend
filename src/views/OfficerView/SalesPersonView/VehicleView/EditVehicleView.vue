<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import type Vehicle from '@/interfaces/Vehicle'
import { getVehicleByNumberPlate, editVehicleById } from '@/services/VehicleService'

const route = useRoute()
const router = useRouter()

const loading = ref<boolean>(true)
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
    vehicle.value.requestedDate = '20210301000000+0700'
    editVehicleById(vehicle.value)
    router.push('/officer/vehicle')
  } catch (error) {
    Swal.fire('Oops!', "Seems like we couldn't fetch the info", 'error')
  }
}

const goBack = () => router.push('/officer/vehicle')

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
      <span>ประเภท</span>
      <input type="text" v-model="vehicle.type" />
    </div>
    <div>
      <span>ขนาด (ที่นั่ง)</span>
      <input type="text" v-model="vehicle.totalSeating" />
    </div>
    <div>
      <span>สถานะ</span>
      <input type="text" v-model="vehicle.status" />
    </div>
  </div>
  <div>
    <button @click="goBack" class="btn btn-danger">ยกเลิก</button>
    <button @click="updateVehicle" class="btn btn-success">ยืนยัน</button>
  </div>
</template>
