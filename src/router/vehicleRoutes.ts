import { RouteConstant } from '@/constants/routeConstant'

const vehiclePage = RouteConstant.Layout.OFFICER + RouteConstant.VEHICLE

const vehicleRoutes = [
    {
        path: vehiclePage,
        component: () => import('../views/OfficerPage/SalesPersonPage/VehiclePage/ListVehiclePage.vue'),
    },
    {
        path: vehiclePage + RouteConstant.Action.CREATE,
        component: () => import('../views/OfficerPage/SalesPersonPage/VehiclePage/CreateVehiclePage.vue'),
    },
    {
        path: vehiclePage + RouteConstant.Action.VIEW,
        component: () => import('../views/OfficerPage/SalesPersonPage/VehiclePage/ViewVehiclePage.vue'),
    },
    {
        path: vehiclePage + RouteConstant.Action.EDIT,
        component: () => import('../views/OfficerPage/SalesPersonPage/VehiclePage/EditVehiclePage.vue'),
    },
]

export default vehicleRoutes