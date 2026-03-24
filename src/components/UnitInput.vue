<template>
  <q-input
    :model-value="displayText"
    :label="label"
    :dense="dense"
    :outlined="outlined"
    :disable="disable"
    :error="hasError"
    :error-message="errorMessage"
    @update:model-value="onInput"
    @focus="onFocus"
    @blur="onBlur"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { DisplaySettings, UnitConfig, UnitDefinition } from 'src/utils/units';
import { DISTANCE_UNITS, findUnitByAlias, getBaseUnit } from 'src/utils/units';
import {
  formatDistance,
  formatDistanceWithSettings,
  isValidPartialInput,
  parseUnitInput,
} from 'src/utils/unitParsing';

const props = defineProps<{
  modelValue: number | null;
  unitConfig: UnitConfig;
  displaySettings?: DisplaySettings | undefined;
  label?: string | undefined;
  dense?: boolean | undefined;
  outlined?: boolean | undefined;
  disable?: boolean | undefined;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void;
}>();

const displayText = ref('');
const lastUsedUnit = ref<UnitDefinition | undefined>(undefined);
const isFocused = ref(false);
const hasError = ref(false);
const errorMessage = ref('');

function getDisplayUnit(): UnitDefinition {
  if (props.displaySettings) {
    if (props.displaySettings.unitSystem === 'imperial') {
      return DISTANCE_UNITS.units.find((u) => u.symbol === 'in')!;
    }
    return (
      DISTANCE_UNITS.units.find(
        (u) => u.symbol === props.displaySettings!.metricUnitSymbol,
      ) ?? DISTANCE_UNITS.units[0]
    );
  }
  return lastUsedUnit.value ?? getBaseUnit(props.unitConfig);
}

function formatValue(baseValue: number): string {
  if (props.displaySettings) {
    return formatDistanceWithSettings(baseValue, props.displaySettings);
  }
  return formatDistance(baseValue, getDisplayUnit());
}

// Sync displayText when modelValue or displaySettings change externally
watch(
  [() => props.modelValue, () => props.displaySettings],
  ([newVal]) => {
    if (isFocused.value) return;
    if (newVal === null || newVal === undefined) {
      displayText.value = '';
      return;
    }
    displayText.value = formatValue(newVal);
  },
  { immediate: true, deep: true },
);

function onInput(value: string | number | null) {
  const text = String(value ?? '');

  if (!isValidPartialInput(text)) {
    return; // reject invalid characters
  }

  displayText.value = text;
  hasError.value = false;
  errorMessage.value = '';

  // Try to parse as-you-type for live updates
  const parsed = parseUnitInput(text, props.unitConfig);
  if (parsed) {
    emit('update:modelValue', parsed.baseValue);
    // Remember the unit for persistence
    const unit = findUnitByAlias(props.unitConfig, parsed.unitSymbol);
    if (unit) {
      lastUsedUnit.value = unit;
    }
  }
}

function onFocus() {
  isFocused.value = true;
}

function onBlur() {
  isFocused.value = false;

  const text = displayText.value.trim();
  if (text === '') {
    emit('update:modelValue', null);
    hasError.value = false;
    errorMessage.value = '';
    return;
  }

  const parsed = parseUnitInput(text, props.unitConfig);
  if (parsed) {
    emit('update:modelValue', parsed.baseValue);
    const unit = findUnitByAlias(props.unitConfig, parsed.unitSymbol);
    if (unit) {
      lastUsedUnit.value = unit;
    }
    // Reformat to clean display
    displayText.value = formatValue(parsed.baseValue);
    hasError.value = false;
    errorMessage.value = '';
  } else {
    // Invalid input — revert to last valid value
    hasError.value = true;
    errorMessage.value = 'Invalid value — include a unit (e.g. 5in, 32mm)';
    if (props.modelValue !== null && props.modelValue !== undefined) {
      displayText.value = formatValue(props.modelValue);
    }
    hasError.value = false;
    errorMessage.value = '';
  }
}
</script>
