<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Toggle from '@vueform/toggle'
import Multiselect from '@vueform/multiselect'
import swal from 'sweetalert'

import axios from '@/AxiosInstance'

const router = useRouter()

const goBack = () => router.push('/officer/vehicle')

interface Vehicle {
  numberPlate: string
  type: string
  totalSeating: number
  status: string,
  requestedBy: string,
  requestedDate: string | null
}

const newVehicle = ref<Vehicle>({
  numberPlate: '',
  type: '',
  totalSeating: 0,
  status: 'Active',
  requestedBy: '',
  requestedDate: null
})

function createVehicle() {
  newVehicle.value.requestedDate = "20210301000000+0700"
  console.log(newVehicle)

  axios
    .post('http://localhost:8001/officer/vehicle/create', newVehicle)
    .then((resp) => router.push('/officer/vehicle'))
    .catch((err) => swal('Oops!', "Seems like we couldn't fetch the info", 'error'))
}
</script>

<template>
  <div>
    <label for="numberPlate">หมายเลขทะเบียน</label>
    <input
      id="numberPlate"
      type="text"
      v-model="newVehicle.numberPlate"
      placeholder="ex. กข 1234"
      required
    />
  </div>
  <div>
    <label for="type">ประเภทรถโดยสาร</label>
    <Multiselect
      id="type"
      v-model="newVehicle.type"
      :options="['Van', 'Minibus']"
      searchable
      required
      regex="[a-zA-Z]"
    />
  </div>
  <div>
    <label for="totalSeating">ความจุที่นั่ง</label>
    <input id="totalSeating" type="number" v-model="newVehicle.totalSeating" required />
  </div>
  <div>
    <label for="status">สถานะ</label>
    <Toggle
      id="status"
      v-model="newVehicle.status"
      on-label="Active"
      off-label="Inactive"
      true-value="Active"
      false-value="Inactive"
    />
  </div>
  <div style="float: right">
    <button @click="goBack" class="btn btn-danger">ยกเลิก</button>
    <button @click="createVehicle" class="btn btn-success">ยืนยัน</button>
  </div>
</template>

<style src="@vueform/toggle/themes/default.css"></style>
<style src="@vueform/multiselect/themes/default.css"></style>
