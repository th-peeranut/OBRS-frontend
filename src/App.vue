<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <!-- <nav>
    <ul>
      <li><router-link :to="{ name: 'Home' }"> Home </router-link></li>
      <li><router-link :to="{ name: 'About' }"> About </router-link></li>
    </ul>
  </nav> -->
  <router-view />
</template>
