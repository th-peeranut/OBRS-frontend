import { Route } from '@/constants/routeConstant'

const routeRoutes = [
    {
        path: Route.ROUTE,
        component: () => import('../views/OfficerPage/SalesPersonPage/RoutePage/ListRoutePage.vue'),
    },
    {
        path: Route.ROUTE + Route.Action.CREATE,
        component: () => import('../views/OfficerPage/SalesPersonPage/RoutePage/CreateRoutePage.vue'),
    },
    {
        path: Route.ROUTE + Route.Action.CREATE,
        component: () => import('../views/OfficerPage/SalesPersonPage/RoutePage/ViewRoutePage.vue'),
    },
    {
        path: Route.ROUTE + Route.Action.CREATE,
        component: () => import('../views/OfficerPage/SalesPersonPage/RoutePage/EditRoutePage.vue'),
    },
]

export default routeRoutes