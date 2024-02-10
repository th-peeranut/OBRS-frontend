<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import swal from 'sweetalert'
import axios from '@/AxiosInstance'

const router = useRouter();

interface Vehicle {
  numberPlate: string
  type: string
  totalSeating: number
  status: string
}

const vehicles = ref<Vehicle[]>([])

const fetchVehicles = async () => {
  axios
    .get<Vehicle[]>('/vehicle')
    .then((resp) => (vehicles.value = resp.data))
    .catch((err) => swal('Oops!', "Seems like we couldn't fetch the info", 'error'))
}

function removeTodo(todo: object) {
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
      </tr>
    </thead>
    <tbody>
      <tr v-for="(vehicle, index) in vehicles" :key="index">
        <td>{{ index + 1 }}</td>
        <td>{{ vehicle.numberPlate }}</td>
        <td>{{ vehicle.type }}</td>
        <td>{{ vehicle.totalSeating }}</td>
      </tr>
    </tbody>
  </table>
</template>