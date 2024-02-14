import { Route } from '@/constants/routeConstant'

const vehicleRoutes = [
    {
        path: Route.VEHICLE,
        component: () => import('../views/OfficerPage/SalesPersonPage/VehiclePage/ListVehiclePage.vue'),
    },
    {
        path: Route.VEHICLE + Route.Action.CREATE,
        component: () => import('../views/OfficerPage/SalesPersonPage/VehiclePage/CreateVehiclePage.vue'),
    },
    {
        path: Route.VEHICLE + Route.Action.VIEW,
        component: () => import('../views/OfficerPage/SalesPersonPage/VehiclePage/ViewVehiclePage.vue'),
    },
    {
        path: Route.VEHICLE + Route.Action.EDIT,
        component: () => import('../views/OfficerPage/SalesPersonPage/VehiclePage/EditVehiclePage.vue'),
    },
]

export default vehicleRoutes