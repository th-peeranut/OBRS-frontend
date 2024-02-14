<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import type Vehicle from '@/interfaces/Vehicle'
import { createVehicle } from '@/services/VehicleService'
import { generateCurrentTime } from '@/utils/dateUtils'

const items = ['Van', 'Minibus']

const router = useRouter()

const isActive = ref(true)
const newVehicle = ref<Vehicle>({
  id: null,
  numberPlate: '',
  type: 'Select Type',
  totalSeating: 0,
  status: 'Active',
  requestedBy: '',
  requestedDate: ''
})

const goBack = () => router.push('/officer/vehicle')

const createNewVehicle = () => {
  try {
    newVehicle.value.requestedDate = generateCurrentTime()
    createVehicle(newVehicle.value)
    goBack()
  } catch (error) {
    Swal.fire('Oops!', "Seems like we couldn't fetch the info", 'error')
  }
}

const selectItem = (item: string) => {
  newVehicle.value.type = item
}

const toggleActive = () => {
  isActive.value = !isActive.value
  newVehicle.value.status = isActive.value ? 'Active' : 'Inactive'
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
    <div class="dropdown">
      <button
        id="type"
        class="btn btn-secondary dropdown-toggle"
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded="false"
      >
        {{ newVehicle.type }}
      </button>
      <ul class="dropdown-menu">
        <li v-for="(item, index) in items" :key="index">
          <span class="dropdown-item" @click="selectItem(item)">{{ item }}</span>
        </li>
      </ul>
    </div>
  </div>

  <div>
    <label for="totalSeating">ความจุที่นั่ง</label>
    <input id="totalSeating" type="number" v-model="newVehicle.totalSeating" required />
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
  <div style="float: right">
    <button @click="goBack" class="btn btn-danger">ยกเลิก</button>
    <button @click="createNewVehicle" class="btn btn-success">ยืนยัน</button>
  </div>
</template>
