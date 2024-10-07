<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'

const titleClass = ref('title')

// ------------------------------

const text = ref('')

// ------------------------------

const count = ref(0)

function increment() {
  count.value++
}

// ------------------------------

const awesome = ref(true)

function toggle() {
  awesome.value = !awesome.value
}

// ------------------------------
let id = 0
const newTodo = ref('')
const hideCompleted = ref(false)
const todos = ref([
  { id: id++, text: 'Learn HTML', done: true },
  { id: id++, text: 'Learn JavaScript', done: true },
  { id: id++, text: 'Learn Vue', done: false }
])

const filteredTodos = computed(() => {
  return hideCompleted.value ? todos.value.filter((t) => !t.done) : todos.value
})

function addTodo() {
  todos.value.push({ id: id++, text: newTodo.value, done: false })
  newTodo.value = ''
}

function removeTodo(todo: object) {
  todos.value = todos.value.filter((t) => t !== todo)
}

// ------------------------------

const pElementRef = ref(null)

onMounted(() => {
  pElementRef.value.textContent = 'mounted!'
})

// ------------------------------

const todoId = ref(1)
const todoData = ref(null)

async function fetchData() {
  todoData.value = null
  const res = await fetch(
    `https://jsonplaceholder.typicode.com/todos/${todoId.value}`
  )
  todoData.value = await res.json()
}

fetchData()

watch(todoId, fetchData)
</script>

<template>
  <h1 :class="titleClass">Make me red</h1>
  ------------------<br />

  <input v-model="text" placeholder="Type here" />
  <p>{{ text }}</p>
  <button @click="increment">count is: {{ count }}</button>
  ------------------<br />

  <button @click="toggle">toggle</button>
  <h1 v-if="awesome">Vue is awesome!</h1>
  <h1 v-else>Oh no 😢</h1>
  ------------------<br />

  <form @submit.prevent="addTodo">
    <input v-model="newTodo" />
    <button>Add Todo</button>
  </form>
  <ul>
    <li v-for="todo in filteredTodos" :key="todo.id">
      <input type="checkbox" v-model="todo.done" />
      <span :class="{ done: todo.done }">{{ todo.text }}</span>
      <button @click="removeTodo(todo)">X</button>
    </li>
  </ul>
  <button @click="hideCompleted = !hideCompleted">
    {{ hideCompleted ? 'Show all' : 'Hide completed' }}
  </button>
  ------------------<br />

  <p ref="pElementRef">hello</p>
  ------------------<br />

  <p>Todo id: {{ todoId }}</p>
  <button @click="todoId++" :disabled="!todoData">Fetch next todo</button>
  <p v-if="!todoData">Loading...</p>
  <pre v-else>{{ todoData }}</pre>
</template>

<style>
.title {
  color: red;
}

.done {
  text-decoration: line-through;
}
</style>
