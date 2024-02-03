import { createRouter, createWebHistory } from 'vue-router'
import CustomerLayoutVue from '@/layouts/CustomerLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: CustomerLayoutVue,
      redirect: '/',
      children: [
        {
          path: '/',
          component: () => import('@/views/CustomerView/BookingView/FindScheduleView.vue')
        }
      ]
    },
    {
      path: '/officer',
      component: () => import('@/layouts/OfficerLayout.vue'),
      redirect: 'officer',
      children: [
        {
          path: 'vehicle',
          component: () => import('../views/OfficerView/SalesPersonView/VehicleView.vue')
        }
      ]
    },
    {
      path: '/signup',
      component: () => import('../views/Signup.vue')
    },
    {
      path: '/login',
      component: () => import('../views/Login.vue')
    },
    {
      path: '/about',
      component: () => import('../views/AboutView.vue')
    },
  ]
})

export default router
