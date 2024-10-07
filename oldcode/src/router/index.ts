import { createRouter, createWebHistory } from 'vue-router'
import CustomerLayoutVue from '@/layouts/CustomerLayout.vue'
import vehicleRoutes from './vehicleRoutes'
import routeRoutes from './routeRoutes'

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
    ...vehicleRoutes,
    ...routeRoutes,
    {
      path: '/officer',
      component: () => import('@/layouts/OfficerLayout.vue')
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
