<script setup lang="ts">
import Swal from 'sweetalert2'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { RouteConstant } from '@/constants/routeConstant'
import type Route from '@/interfaces/Route'
import { createRoute } from '@/services/RouteService'
import { generateCurrentTime } from '@/utils/dateUtils'

const router = useRouter()

const isActive = ref(true)
const newRoute = ref<Route>({
  id: null,
  name: '',
  stations: [],
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

interface Box {
  id: number
  text: string
  order: number
}

const boxes = ref<Box[]>([
  { id: 1, text: 'Box 1', order: 1 },
  { id: 2, text: 'Box 2', order: 2 },
  { id: 3, text: 'Box 3', order: 3 }
])

let draggingIndex = -1
let startY = 0

const startDrag = (index: number, event: MouseEvent) => {
  draggingIndex = index
  startY = event.clientY
}

const handleDrag = (event: MouseEvent) => {
  if (draggingIndex === -1) return
  const deltaY = event.clientY - startY
  const newIndex = Math.round(draggingIndex + deltaY / 120) // Adjusted for better spacing
  if (newIndex >= 0 && newIndex < boxes.value.length && newIndex !== draggingIndex) {
    const tempOrder = boxes.value[newIndex].order
    boxes.value[newIndex].order = boxes.value[draggingIndex].order
    boxes.value[draggingIndex].order = tempOrder
    draggingIndex = newIndex
  }
}

const endDrag = () => {
  draggingIndex = -1
}
</script>

<template>
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

  <div class="container">
    <div
      v-for="(box, index) in boxes"
      :key="box.id"
      class="box card"
      :style="{ order: box.order }"
      @mousedown="startDrag(index, $event)"
      @mousemove="handleDrag($event)"
      @mouseup="endDrag()"
    >
      <div class="card-body">
        {{ box.text }}
      </div>
    </div>
  </div>
  <div style="float: right">
    <button @click="goBack" class="btn btn-danger">ยกเลิก</button>
    <button @click="createNewRoute" class="btn btn-success">ยืนยัน</button>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
}

.box {
  width: 100%;
  margin-bottom: 10px;
  cursor: grab;
  transition: order 0.3s ease-in-out;
  user-select: none;
}

.card {
  cursor: grab;
}
</style>
