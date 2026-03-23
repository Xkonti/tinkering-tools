<template>
  <q-layout view="hHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title>
          Tinkering Tools<template v-if="toolName"> - {{ toolName }}</template>
        </q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered>
      <q-list>
        <q-item-label header>Tools</q-item-label>
        <q-separator />
        <ToolCategoryNav
          v-for="category in toolCategories"
          :key="category.name"
          :category="category"
        />
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { toolCategories } from 'src/data/tools';
import ToolCategoryNav from 'components/ToolCategoryNav.vue';

const route = useRoute();
const toolName = computed(() => route.meta.toolName);

const leftDrawerOpen = ref(false);

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
}
</script>
