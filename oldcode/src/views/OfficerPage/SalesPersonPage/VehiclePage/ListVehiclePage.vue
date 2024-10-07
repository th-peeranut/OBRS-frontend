<script setup lang="ts">
import Swal from 'sweetalert2'
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { RouteConstant } from '@/constants/routeConstant'
import type Vehicle from '@/interfaces/Vehicle'
import { deleteVehicleByNumberPlate, getAllVehicles } from '@/services/VehicleService'

const router = useRouter()

const loading = ref(true)
const vehicles = ref<Vehicle[]>([])

const vehiclePage = RouteConstant.Layout.OFFICER + RouteConstant.VEHICLE
const formattedURL = (originalURL: string, numberPlate: string) =>
  originalURL.replace(':id', numberPlate)

watch(vehicles, async () => {
  await fetchAllVehicles()
})

onMounted(() => {
  fetchAllVehicles()
})

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
  router.push({ path: formattedURL(vehiclePage + RouteConstant.Action.VIEW, numberPlate) })
}

const goToVehicleEditPage = (numberPlate: string) => {
  router.push({ path: formattedURL(vehiclePage + RouteConstant.Action.EDIT, numberPlate) })
}
</script>

<template>
  <div style="text-align: center">
    <h2>รถโดยสาร</h2>
  </div>

  <div v-if="loading">Loading...</div>
  <div v-else>
    <div style="float: right">
      <router-link
        :to="{ path: `${vehiclePage + RouteConstant.Action.CREATE}` }"
        class="btn btn-primary"
      >
        เพิ่ม
      </router-link>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">ป้ายทะเบียน</th>
          <th scope="col">ประเภท</th>
          <th scope="col">ความจุที่นั่ง</th>
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
