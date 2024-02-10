import Axios from 'axios'

const axios = Axios.create({
  baseURL: '/api',
  // responseType: 'json',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 1000 * 60 * 10,
})

export default axios;
