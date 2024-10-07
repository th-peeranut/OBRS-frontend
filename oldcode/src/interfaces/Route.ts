export default interface Route {
    id: string,
    name: string
    stations: Array<string>
    status: string
    requestedBy: string
    requestedDate: string
}