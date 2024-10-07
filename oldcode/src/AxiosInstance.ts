import Axios from 'axios'

const axios = Axios.create({
  baseURL: 'http://localhost:8000',
  // responseType: 'json',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 1000 * 60 * 10,
})

export default axios;
