<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import type Vehicle from '@/interfaces/Vehicle'
import { getAllVehicles, deleteVehicleByNumberPlate } from '@/services/VehicleService'

const loading = ref<boolean>(true)
const vehicles = ref<Vehicle[]>([])

const router = useRouter()

const fetchAllVehicles = async () => {
  try {
    vehicles.value = await getAllVehicles()
    loading.value = false
  } catch (error) {
    Swal.fire('Oops!', "Seems like we couldn't fetch the info", 'error')
  }
}

const deleteVehicle = (numberPlate: string) => {
  try {
    Swal.fire({
      title: 'Are you sure ?',
      text: 'You will not be able to recover this environment !',
      icon: 'warning',
      showCancelButton: true,
      // confirmButtonColor: '#DD6B55',
      confirmButtonText: 'Yes, delete it !',
      cancelButtonText: 'No, cancel !'
    }).then(async (result) => {
      if (result.isConfirmed) {
        await deleteVehicleByNumberPlate(numberPlate)
        vehicles.value = vehicles.value.filter((vehicle) => vehicle.numberPlate !== numberPlate)
        Swal.fire({
          title: 'Deleted!',
          text: 'Delete Vehicle successfully',
          icon: 'success'
        })
      }
    })
  } catch (error) {
    Swal.fire({
      title: 'Oops!',
      text: "Seems like we couldn't fetch the info",
      icon: 'error'
    })
  }
}

const goToVehicleViewPage = (numberPlate: string) => {
  router.push({ path: `/officer/vehicle/${numberPlate}`, params: { id: numberPlate } })
}

const goToVehicleEditPage = (numberPlate: string) => {
  router.push({ path: `/officer/vehicle/${numberPlate}/edit`, params: { id: numberPlate } })
}

onMounted(() => {
  fetchAllVehicles()
})
</script>

<template>
  <div style="text-align: center">
    <h2>รถโดยสาร</h2>
  </div>

  <div v-if="loading">Loading...</div>
  <div v-else>
    <div style="float: right">
      <router-link to="/officer/vehicle/create" class="btn btn-primary">เพิ่ม</router-link>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">ป้ายทะเบียน</th>
          <th scope="col">ประเภท</th>
          <th scope="col">ขนาด (ที่นั่ง)</th>
          <th scope="col">สถานะ</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(vehicle, index) in vehicles" :key="index">
          <td>{{ index + 1 }}</td>
          <td>{{ vehicle.numberPlate }}</td>
          <td>{{ vehicle.type }}</td>
          <td>{{ vehicle.totalSeating }}</td>
          <td>{{ vehicle.status }}</td>
          <td>
            <button @click="goToVehicleViewPage(vehicle.numberPlate)">View</button>
            <button @click="goToVehicleEditPage(vehicle.numberPlate)">Edit</button>
            <button @click="deleteVehicle(vehicle.numberPlate)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
