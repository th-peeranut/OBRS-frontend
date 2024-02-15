import { RouteConstant } from '@/constants/routeConstant'

const routePage = RouteConstant.Layout.OFFICER + RouteConstant.ROUTE

const routeRoutes = [
    {
        path: routePage,
        component: () => import('../views/OfficerPage/SalesPersonPage/RoutePage/ListRoutePage.vue'),
    },
    {
        path: routePage + RouteConstant.Action.CREATE,
        component: () => import('../views/OfficerPage/SalesPersonPage/RoutePage/CreateRoutePage.vue'),
    },
    {
        path: routePage + RouteConstant.Action.VIEW,
        component: () => import('../views/OfficerPage/SalesPersonPage/RoutePage/ViewRoutePage.vue'),
    },
    {
        path: routePage + RouteConstant.Action.EDIT,
        component: () => import('../views/OfficerPage/SalesPersonPage/RoutePage/EditRoutePage.vue'),
    },
]

export default routeRoutes