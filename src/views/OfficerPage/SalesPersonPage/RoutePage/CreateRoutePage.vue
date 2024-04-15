<script setup lang="ts">
import Swal from 'sweetalert2'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

import { RouteConstant } from '@/constants/routeConstant'
import type Route from '@/interfaces/Route'
import { createRoute } from '@/services/RouteService'
import { generateCurrentTime } from '@/utils/dateUtils'

import DraggableComponent from '@/components/DraggableComponent.vue'

const router = useRouter()

const isActive = ref(true)
const newStationName = ref('')
const newRoute = ref<Route>({
  id: null,
  name: '',
  stations: ['sample', '2'],
  status: 'Active',
  requestedBy: '',
  requestedDate: ''
})

const routePage = RouteConstant.Layout.OFFICER + RouteConstant.ROUTE

const goBack = () => router.push(routePage)

const toggleActive = () => {
  isActive.value = !isActive.value
  newRoute.value.status = isActive.value ? 'Active' : 'Inactive'
}

const createNewRoute = () => {
  try {
    newRoute.value.requestedDate = generateCurrentTime()
    createRoute(newRoute.value)
    goBack()
  } catch (error) {
    Swal.fire('Oops!', "Seems like we couldn't fetch the info", 'error')
  }
}

const addNewStation = () => {
  if (newStationName.value.trim().length > 0) {
    newRoute.value.stations.push(newStationName.value)
    newStationName.value = ''
  }
}
</script>

<template>
  <div class="row">
    <div>
      <h2>เพิ่มเส้นทาง</h2>
    </div>
    <div>
      <label for="name">ชื่อ</label>
      <input id="name" type="text" v-model="newRoute.name" required />
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

    <div class="mt-3">
      <span>
        <input type="text" v-model="newStationName" placeholder="insert new station" />
        <button
          type="button"
          class="buttonAdd btn btn-primary"
          style="margin-left: 10px"
          @click="addNewStation"
        >
          + Create
        </button>
      </span>
    </div>

    <div class="col-6">
      <DraggableComponent v-model="newRoute.stations" />
    </div>

    <div style="float: right">
      <button @click="goBack" class="btn btn-danger">ยกเลิก</button>
      <button @click="createNewRoute" class="btn btn-success">ยืนยัน</button>
    </div>
  </div>
</template>
