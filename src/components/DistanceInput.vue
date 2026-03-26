<template>
  <UnitInput
    :model-value="modelValue"
    :unit-config="DISTANCE_UNITS"
    :display-settings="displaySettings"
    :raw-input="rawInput"
    :label="label"
    :dense="dense"
    :outlined="outlined"
    :disable="disable"
    @update:model-value="$emit('update:modelValue', $event)"
    @update:raw-input="$emit('update:rawInput', $event)"
  />
</template>

<script setup lang="ts">
import UnitInput from './UnitInput.vue';
import type { DisplaySettings } from 'src/utils/units';
import { DISTANCE_UNITS } from 'src/utils/units';

defineProps<{
  modelValue: number | null;
  displaySettings?: DisplaySettings | undefined;
  rawInput?: string | undefined;
  label?: string | undefined;
  dense?: boolean | undefined;
  outlined?: boolean | undefined;
  disable?: boolean | undefined;
}>();

defineEmits<{
  (e: 'update:modelValue', value: number | null): void;
  (e: 'update:rawInput', value: string): void;
}>();
</script>
