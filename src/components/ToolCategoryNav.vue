<template>
  <q-expansion-item
    group="sidebar-nav"
    :icon="category.icon"
    :label="category.name"
    header-class="text-weight-bold"
  >
    <ToolEntryNav
      v-for="tool in category.tools"
      :key="tool.routePath"
      :tool="tool"
    />
  </q-expansion-item>
</template>

<script setup lang="ts">
import type { ToolCategory } from 'src/data/tools';
import ToolEntryNav from 'components/ToolEntryNav.vue';

defineProps<{
  category: ToolCategory;
}>();
</script>
