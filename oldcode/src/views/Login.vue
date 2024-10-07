<script setup lang="ts">
import { ref, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import axios from '@/AxiosInstance'

interface Credential {
  phoneNumber: number | null
  email: string | null
  password: string | null
}

const username = ref<string | number | null>(null)

const credentials: Credential = reactive({
  phoneNumber: null,
  email: null,
  password: null
})

const validateUsername = () => {
  if (typeof username === 'number') {
    credentials.phoneNumber = username
  } else if (typeof username === 'string') {
    credentials.email = username
  }
}

const onSubmit = () => {
  try {
    validateUsername()

    axios.post('/user/login', credentials).then(() => {
      alert('login success')
    })
  } catch (error) {
    alert("The email address or mobile number you entered isn't connected to an account")
  }
}
</script>

<template>
  <div class="row">
    <div class="col-md-6 offset-md-3">
      <div>
        <h3>Login</h3>
        <hr />
      </div>

      <form @submit.prevent="onSubmit">
        <div class="form-group">
          <input
            id="email"
            type="text"
            class="form-control"
            v-model="username"
            placeholder="Email address or phone number"
            required
          />
        </div>

        <div class="form-group">
          <input
            id="password"
            type="password"
            class="form-control"
            v-model="credentials.password"
            placeholder="Password"
            required
          />
        </div>

        <div class="my-3">
          <button class="btn btn-primary">Log in</button>
        </div>
      </form>

      <div>
        <RouterLink to="#">Forgetten password?</RouterLink>
      </div>

      <hr />

      <div>
        <RouterLink to="/signup" role="button" class="btn btn-success">
          Create new account
        </RouterLink>
      </div>
    </div>
  </div>
</template>
