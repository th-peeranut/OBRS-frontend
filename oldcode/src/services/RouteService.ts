import axios from '@/AxiosInstance'
import { RouteConstant } from '@/constants/routeConstant'

import type Route from '@/interfaces/Route'

export const createRoute = async (route: Route) => {
    await axios
        .post(RouteConstant.ROUTE, route)
        .catch((error) => {
            throw error;
        })
}

export const getAllRoutes = async () => {
    return await axios
        .get<Route[]>(RouteConstant.ROUTE)
        .then((resp) => resp.data)
        .catch((error) => {
            throw error;
        })
}

export const getRouteById = async (id: string) => {
    return await axios
        .get<Route>(`${RouteConstant.ROUTE}/${id}`)
        .then((resp) => { return resp.data })
        .catch((error) => {
            throw error;
        })
}

export const editRouteById = async (route: Route) => {
    await axios
        .put(`${RouteConstant.ROUTE}/${route.id}`, route)
        .catch((error) => {
            throw error;
        })
}

export const deleteRouteById = async (id: string) => {
    await axios
        .delete(`${RouteConstant.ROUTE}/${id}`)
        .catch((error) => {
            throw error;
        })
}
