<script setup lang="ts">
import Swal from 'sweetalert2'
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { RouteConstant } from '@/constants/routeConstant'
import type Route from '@/interfaces/Route'
import { deleteRouteById, getAllRoutes } from '@/services/RouteService'

const router = useRouter()

const loading = ref(true)
const routes = ref<Route[]>([])

const routePage = RouteConstant.Layout.OFFICER + RouteConstant.ROUTE

watch(routes, async () => {
  await fetchAllRoutes()
})

onMounted(() => {
  fetchAllRoutes()
})

const fetchAllRoutes = async () => {
  try {
    routes.value = await getAllRoutes()
    loading.value = false
  } catch (error) {
    Swal.fire('Oops!', "Seems like we couldn't fetch the info", 'error')
  }
}

const deleteRoute = (id: string) => {
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
        await deleteRouteById(id)
        routes.value = routes.value.filter((route) => route.id !== id)
        Swal.fire({
          title: 'Deleted!',
          text: 'Delete Route successfully',
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

const goToRouteViewPage = (id: string) => {
  router.push({ path: routePage + RouteConstant.Action.VIEW + id })
}

const goToRouteEditPage = (id: string) => {
  router.push({ path: routePage + RouteConstant.Action.EDIT + id })
}
</script>

<template>
  <div style="text-align: center">
    <h2>เส้นทาง</h2>
  </div>

  <div v-if="loading">Loading...</div>
  <div v-else>
    <div style="float: right">
      <router-link
        :to="{ path: `${routePage + RouteConstant.Action.CREATE}` }"
        class="btn btn-primary"
      >
        เพิ่ม
      </router-link>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">ชื่อ</th>
          <th scope="col">จุดจอด</th>
          <th scope="col">สถานะ</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(route, index) in routes" :key="index">
          <td>{{ index + 1 }}</td>
          <td>{{ route.name }}</td>
          <td>{{ route.stations }}</td>
          <td>{{ route.status }}</td>
          <td>
            <button @click="goToRouteViewPage(route.id)">View</button>
            <button @click="goToRouteEditPage(route.id)">Edit</button>
            <button @click="deleteRoute(route.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
