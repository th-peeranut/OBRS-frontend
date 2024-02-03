<script setup lang="ts">
import { ref } from 'vue'
import axios from '@/AxiosInstance'
import Toggle from '@vueform/toggle'
import Multiselect from '@vueform/multiselect'

const vehicle = ref({
    numberPlate: '',
    type: '',
    totalSeating: 0,
    status: 'Active'
})

function postData() {
    // axios
    //     .post('/vehicle', vehicle)
    //     .then(() => alert('success'))
    //     .catch(() => alert('error'))
    // POST
    //   todos.value.push({ id: id++, text: newTodo.value, done: false })
    //   newTodo.value = ''
}

async function getVehicle() {
    // GET
    //   todoData.value = null
    //   const res = await fetch(
    //     `https://jsonplaceholder.typicode.com/todos/${todoId.value}`
    //   )
    //   todoData.value = await res.json()
}

function removeTodo(todo: object) {
    // DELETE
    //   todos.value = todos.value.filter((t) => t !== todo)
}
</script>

<template>
    <form @submit.prevent="postData" method="post">
        <div>
            <label for="numberPlate">หมายเลขทะเบียน</label>
            <input
                id="numberPlate"
                type="text"
                v-model="vehicle.numberPlate"
                placeholder="ex. กข 1234"
                required
            />
        </div>
        <div>
            <label for="type">ประเภทรถโดยสาร</label>
            <Multiselect
                id="type"
                v-model="vehicle.type"
                :options="['Van', 'Minibus']"
                searchable
                required
                regex="[a-zA-Z]"
            />
        </div>
        <div>
            <label for="totalSeating">ความจุที่นั่ง</label>
            <input id="totalSeating" type="number" v-model="vehicle.totalSeating" required />
        </div>
        <div>
            <label for="status">สถานะ</label>
            <Toggle
                id="status"
                v-model="vehicle.status"
                on-label="Active"
                off-label="Inactive"
                true-value="Active"
                false-value="Inactive"
            />
        </div>
        <button>Add Vehicle</button>
    </form>
</template>

<style src="@vueform/toggle/themes/default.css"></style>
<style src="@vueform/multiselect/themes/default.css"></style>
