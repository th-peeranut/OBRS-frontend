<script setup lang="ts">
import { ref } from 'vue'
import { googleSdkLoaded } from 'vue3-google-login'
import axios from '@/AxiosInstance'

const userDetails = ref({
  name: null,
  email: null,
  picture: null
})

const login = () => {
  googleSdkLoaded((google) => {
    google.accounts.oauth2
      .initCodeClient({
        client_id: '58730156701-di0.apps.googleusercontent.com',
        scope: 'email profile openid',
        redirect_uri: 'http://localhost:4000/auth/callback',
        callback: (response) => {
          if (response.code) {
            sendCodeToBackend(response.code)
          }
        }
      })
      .requestCode()
  })
}

const sendCodeToBackend = async (code) => {
  try {
    const headers = {
      Authorization: code
    }
    const response = await axios.post('http://localhost:4000/auth', null, { headers })
    const userDetails = response.data
    console.log('User Details:', userDetails)
    // userDetails = userDetails

    // Redirect to the homepage ("/")
    //this.$router.push("/rex");
  } catch (error) {
    console.error('Failed to send authorization code:', error)
  }
}
</script>

<template>
  <div>
    <button @click="login">Login Using Google</button>
    <div v-if="userDetails">
      <h2>User Details</h2>
      <p>Name: {{ userDetails.name }}</p>
      <p>Email: {{ userDetails.email }}</p>
      <p>Profile Picture: <img :src="userDetails.picture" alt="Profile Picture" /></p>
    </div>
  </div>
</template>
