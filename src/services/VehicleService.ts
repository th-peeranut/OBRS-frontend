import axios from '@/AxiosInstance'
import type Vehicle from '@/interfaces/Vehicle'

export const createVehicle = async (vehicle: Vehicle) => {
    await axios
        .post('/vehicle', vehicle)
        .catch((error) => {
            throw error;
        })
}

export const getAllVehicles = async () => {
    return await axios
        .get<Vehicle[]>('/vehicle')
        .then((resp) => resp.data)
        .catch((error) => {
            throw error;
        })
}

export const getVehicleByNumberPlate = async (numberPlate: string) => {
    return await axios
        .get<Vehicle>(`/vehicle/${numberPlate}`)
        .then((resp) => { return resp.data })
        .catch((error) => {
            throw error;
        })
}

export const editVehicleById = async (vehicle: Vehicle) => {
    await axios
        .put(`/vehicle/${vehicle.id}`, vehicle)
        .catch((error) => {
            throw error;
        })
}

export const deleteVehicleByNumberPlate = async (numberPlate: string) => {
    await axios
        .delete(`/vehicle/${numberPlate}`)
        .catch((error) => {
            throw error;
        })
}
