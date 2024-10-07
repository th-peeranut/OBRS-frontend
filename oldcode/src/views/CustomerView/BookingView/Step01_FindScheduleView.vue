<script setup lang="ts">
import { ref } from 'vue'

const itinerary = ref({
  plan: 'return'
})
</script>

<template>
  <div class="tabs is-toggle is-toggle-rounded">
    <ul>
      <li :class="{ 'is-active': itinerary.plan == 'return' }">
        <a @click.prevent="itinerary.plan = 'return'">Return</a>
      </li>
      <li :class="{ 'is-active': itinerary.plan == 'one-way' }">
        <a @click.prevent="itinerary.plan = 'one-way'">One-way</a>
      </li>
      <li :class="{ 'is-active': itinerary.plan == 'multi-city' }">
        <a @click.prevent="itinerary.plan = 'multi-city'">Multi-city</a>
      </li>
    </ul>
  </div>

  <div>
    <button placeholder="ต้นทาง">ต้นทาง</button>
    <button placeholder="ปลายทาง">ปลายทาง</button>
    <button>จำนวนคน</button>
  </div>
  <button>วันที่เดินทาง</button>
  <button>วันที่เดินทาง</button>
  <a type="button" href="">ค้นหา</a>
</template>
