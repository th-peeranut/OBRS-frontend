<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import swal from 'sweetalert'
import axios from '@/AxiosInstance'

const router = useRouter()

interface Vehicle {
  numberPlate: string
  type: string
  totalSeating: number
  status: string
}

const vehicles = ref<Vehicle[]>([])

const fetchVehicles = () => {
  axios
    .get<Vehicle[]>('/vehicle')
    .then((resp) => (vehicles.value = resp.data))
    .catch((err) => swal('Oops!', "Seems like we couldn't fetch the info", 'error'))
}

const viewVehicleDetail = (numberPlate: string) => {
  router.push({ name: 'View Vehicle', params: { id: numberPlate } })
}

const editVehicleDetail = () => {}

const deleteVehicle = () => {
  // DELETE
  //   todos.value = todos.value.filter((t) => t !== todo)
}

onMounted(() => {
  fetchVehicles()
})
</script>

<template>
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
          <button @click="viewVehicleDetail(vehicle.numberPlate)">View</button>
          <button @click="editVehicleDetail">Edit</button>
          <button @click="deleteVehicle">Delete</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
