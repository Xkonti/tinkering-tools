<template>
  <q-item clickable v-ripple :to="tool.routePath">
    <q-item-section avatar>
      <q-icon :name="tool.icon" />
    </q-item-section>
    <q-item-section>{{ tool.name }}</q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import type { Tool } from 'src/data/tools';

defineProps<{
  tool: Tool;
}>();
</script>
