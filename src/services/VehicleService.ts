import axios from '@/AxiosInstance'
import { RouteConstant } from '@/constants/routeConstant'

import type Vehicle from '@/interfaces/Vehicle'

export const createVehicle = async (vehicle: Vehicle) => {
    await axios
        .post(RouteConstant.VEHICLE, vehicle)
        .catch((error) => {
            throw error;
        })
}

export const getAllVehicles = async () => {
    return await axios
        .get<Vehicle[]>(RouteConstant.VEHICLE)
        .then((resp) => resp.data)
        .catch((error) => {
            throw error;
        })
}

export const getVehicleByNumberPlate = async (numberPlate: string) => {
    return await axios
        .get<Vehicle>(`${RouteConstant.VEHICLE}/${numberPlate}`)
        .then((resp) => { return resp.data })
        .catch((error) => {
            throw error;
        })
}

export const editVehicleById = async (vehicle: Vehicle) => {
    await axios
        .put(`${RouteConstant.VEHICLE}/${vehicle.id}`, vehicle)
        .catch((error) => {
            throw error;
        })
}

export const deleteVehicleByNumberPlate = async (numberPlate: string) => {
    await axios
        .delete(`${RouteConstant.VEHICLE}/${numberPlate}`)
        .catch((error) => {
            throw error;
        })
}
