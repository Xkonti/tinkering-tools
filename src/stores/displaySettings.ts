import { useLocalStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed } from 'vue';
import type {
  DisplaySettings,
  RoundingStrategy,
  UnitDefinition,
} from 'src/utils/units';
import { DISTANCE_UNITS } from 'src/utils/units';

const STORAGE_KEY = 'tinkering-tools:board-cut-optimizer:v2:displaySettings';
const OLD_DISPLAY_UNIT_KEY =
  'tinkering-tools:board-cut-optimizer:v2:displayUnit';

export const useDisplaySettingsStore = defineStore('displaySettings', () => {
  // --- Migrate from old displayUnit key ---
  const oldValue = localStorage.getItem(OLD_DISPLAY_UNIT_KEY);
  let defaultUnitSystem: 'imperial' | 'metric' = 'imperial';
  let defaultMetricUnit: DisplaySettings['metricUnitSymbol'] = 'cm';
  if (oldValue !== null) {
    if (oldValue === 'mm' || oldValue === 'cm' || oldValue === 'dm' || oldValue === 'm') {
      defaultUnitSystem = 'metric';
      defaultMetricUnit = oldValue;
    } else {
      defaultUnitSystem = 'imperial';
    }
    localStorage.removeItem(OLD_DISPLAY_UNIT_KEY);
  }

  const unitSystem = useLocalStorage<'imperial' | 'metric'>(
    `${STORAGE_KEY}:unitSystem`,
    defaultUnitSystem,
  );
  const metricUnitSymbol = useLocalStorage<DisplaySettings['metricUnitSymbol']>(
    `${STORAGE_KEY}:metricUnit`,
    defaultMetricUnit,
  );
  const metricResolutionMm = useLocalStorage<number>(
    `${STORAGE_KEY}:metricResolution`,
    1,
  );
  const imperialPrecision = useLocalStorage<number>(
    `${STORAGE_KEY}:imperialPrecision`,
    32,
  );
  const imperialShowFeet = useLocalStorage<boolean>(
    `${STORAGE_KEY}:imperialShowFeet`,
    true,
  );
  const roundingStrategy = useLocalStorage<RoundingStrategy>(
    `${STORAGE_KEY}:rounding`,
    'ceil',
  );

  const settings = computed<DisplaySettings>(() => ({
    unitSystem: unitSystem.value,
    metricUnitSymbol: metricUnitSymbol.value,
    metricResolutionMm: metricResolutionMm.value,
    imperialPrecision: imperialPrecision.value,
    imperialShowFeet: imperialShowFeet.value,
    roundingStrategy: roundingStrategy.value,
  }));

  const displayUnit = computed<UnitDefinition>(() => {
    if (unitSystem.value === 'imperial') {
      return DISTANCE_UNITS.units.find((u) => u.symbol === 'in')!;
    }
    return (
      DISTANCE_UNITS.units.find(
        (u) => u.symbol === metricUnitSymbol.value,
      ) ?? DISTANCE_UNITS.units[0]
    );
  });

  return {
    unitSystem,
    metricUnitSymbol,
    metricResolutionMm,
    imperialPrecision,
    imperialShowFeet,
    roundingStrategy,
    settings,
    displayUnit,
  };
});
