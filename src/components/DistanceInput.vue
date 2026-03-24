<template>
  <UnitInput
    :model-value="modelValue"
    :unit-config="DISTANCE_UNITS"
    :label="label"
    :dense="dense"
    :outlined="outlined"
    :disable="disable"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import UnitInput from './UnitInput.vue';
import { DISTANCE_UNITS } from 'src/utils/units';

defineProps<{
  modelValue: number | null;
  label?: string | undefined;
  dense?: boolean | undefined;
  outlined?: boolean | undefined;
  disable?: boolean | undefined;
}>();

defineEmits<{
  (e: 'update:modelValue', value: number | null): void;
}>();
</script>
