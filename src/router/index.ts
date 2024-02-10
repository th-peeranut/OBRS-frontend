import { createRouter, createWebHistory } from 'vue-router'
import CustomerLayoutVue from '@/layouts/CustomerLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      // component: CustomerLayoutVue,
      children: [
        {
          path: '/',
          component: () => import('@/views/CustomerView/BookingView/Step01_FindScheduleView.vue')
        },
        {
          path: 'search?',
          component: () => import('@/views/CustomerView/BookingView/Step02_ShowScheduleView.vue')
        },
        {
          path: 'signup',
          component: () => import('../views/Signup.vue')
        },
        {
          path: 'login',
          component: () => import('../views/Login.vue')
        },
        
      ]
    },
    {
      path: '/officer',
      component: () => import('@/layouts/OfficerLayout.vue'),
      children: [
        {
          path: 'vehicle',
          component: () => import('../views/OfficerView/SalesPersonView/VehicleView/ListVehicleView.vue')
        },
        {
          path: 'vehicle/create',
          component: () => import('../views/OfficerView/SalesPersonView/VehicleView/CreateVehicleView.vue'),
          name: 'Create Vehicle'
        },
        {
          path: 'vehicle/:id',
          component: () => import('../views/OfficerView/SalesPersonView/VehicleView/ShowVehicleView.vue'),
          name: 'View Vehicle'
        },
        {
          path: 'vehicle/:id/edit',
          component: () => import('../views/OfficerView/SalesPersonView/VehicleView/EditVehicleView.vue'),
          name: 'Edit Vehicle'
        }
      ]
    },
    {
      path: '/en',
      component: () => import('@/views/CustomerView/BookingView/Step01_FindScheduleView.vue'),
      children: [

      ]
    },
    {
      path: '/about',
      component: () => import('../views/AboutView.vue')
    },
    {
      path: '/:catchAll(.*)',
      component: () => import('../views/NotFoundView.vue')
    }
  ]
})

export default router
