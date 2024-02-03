<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const signup = ref({
  firstName: null,
  lastName: null,
  phoneNumber: null,
  email: null,
  password: null,
  birthDate: null,
  gender: null
})

const username = ref<string | number | null>(null)

</script>

<template>
  <div class="row">
    <div class="col-md-6 offset-md-3">
      <div>
        <h3>Create a new account</h3>
      </div>

      <form>
        <div>
          <div>
          <input id="firstName" type="text" class="form-control" placeholder="First name" v-model="signup.firstName" required />
          </div>

          <div>
          <input id="lastName" type="text" class="form-control" placeholder="Last name" v-model="signup.lastName" required />
          </div>
        </div>
        
        <div class="form-group">
          <input id="username" type="text" class="form-control" placeholder="Mobile number or email address" v-model="username" required />
        </div>

        <div class="form-group">
          <input
            id="password"
            type="password"
            class="form-control"
            placeholder="New password"
            v-model="signup.password"
            required
          />
        </div>

        <div>
          <label for="birthDate">Date of birth</label>
          
        </div>

        <div class="my-3">
          <button type="submit" class="btn btn-primary">Sign Up</button>
        </div>
      </form>

      <div>
        <p>
          <RouterLink to="/login">Already have an account?</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
