<template>
  <q-page class="q-pa-lg">
    <div class="text-h4 q-mb-lg">Available Tools</div>

    <div v-for="category in toolCategories" :key="category.name" class="q-mb-lg">
      <div class="text-h5 q-mb-sm">
        <q-icon :name="category.icon" class="q-mr-sm" />
        {{ category.name }}
      </div>
      <q-separator class="q-mb-md" />

      <div class="row q-col-gutter-md">
        <div
          v-for="tool in category.tools"
          :key="tool.routePath"
          class="col-12 col-sm-6 col-md-4"
        >
          <q-card
            clickable
            v-ripple
            class="cursor-pointer full-height"
            @click="$router.push(tool.routePath)"
          >
            <q-card-section>
              <div class="row items-center q-mb-sm">
                <q-icon :name="tool.icon" size="sm" class="q-mr-sm" />
                <div class="text-subtitle1 text-weight-bold">{{ tool.name }}</div>
              </div>
              <div class="text-body2 text-grey-7">{{ tool.description }}</div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { toolCategories } from 'src/data/tools';
</script>
