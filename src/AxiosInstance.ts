import Axios from 'axios'

const axios = Axios.create({
  baseURL: import.meta.env.VITE_BACKEND,
  responseType: 'json',
  timeout: 1000 * 60 * 10,
})

export default axios;
