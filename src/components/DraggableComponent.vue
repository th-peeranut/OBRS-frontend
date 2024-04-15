<script setup lang="ts">
import { defineComponent, ref, computed, watch, watchEffect } from 'vue'
import type { PropType } from 'vue'
import draggable from 'vuedraggable'

const props = defineProps({
  stations: {
    type: Array<String>,
    default: () => []
  }
})

const stations = ref(props.stations)

const dragOptions = computed(() => ({
  animation: 200,
  group: 'description',
  disabled: false,
  ghostClass: 'ghost'
}))
</script>

<template>
  <draggable class="list-group" v-model="stations" v-bind="dragOptions" item-key="id">
    <template #item="{ element }">
      <li class="list-group-item">
        {{ element }}
      </li>
    </template>
  </draggable>
</template>

<style scoped>
.ghost {
  opacity: 0.5;
  background: #c8ebfb;
}
.list-group {
  min-height: 20px;
}

.list-group-item {
  cursor: grab;
}
</style>
