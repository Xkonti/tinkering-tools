// --- Unit system types ---

export interface UnitDefinition {
  readonly name: string;
  readonly symbol: string;
  readonly aliases: readonly string[];
  readonly toBase: number;
  readonly fractional?: true;
  readonly precision?: number;
}

export interface UnitConfig {
  readonly units: readonly [UnitDefinition, ...UnitDefinition[]];
}

// --- Distance units (base = mm) ---

export const DISTANCE_UNITS: UnitConfig = {
  units: [
    { name: 'millimeter', symbol: 'mm', aliases: ['mm'], toBase: 1 },
    { name: 'centimeter', symbol: 'cm', aliases: ['cm'], toBase: 10 },
    { name: 'decimeter', symbol: 'dm', aliases: ['dm'], toBase: 100 },
    { name: 'meter', symbol: 'm', aliases: ['m'], toBase: 1000 },
    {
      name: 'inch',
      symbol: 'in',
      aliases: ['in', '"'],
      toBase: 25.4,
      fractional: true,
      precision: 32,
    },
    {
      name: 'foot',
      symbol: 'ft',
      aliases: ['ft', "'"],
      toBase: 304.8,
      fractional: true,
      precision: 32,
    },
  ],
};

// --- Rounding & display settings ---

export type RoundingStrategy = 'ceil' | 'floor' | 'round';

export interface DisplaySettings {
  readonly unitSystem: 'imperial' | 'metric';
  readonly metricUnitSymbol: 'mm' | 'cm' | 'dm' | 'm';
  readonly metricResolutionMm: number;
  readonly imperialPrecision: number;
  readonly imperialShowFeet: boolean;
  readonly roundingStrategy: RoundingStrategy;
}

/**
 * Compute the number of decimal places needed to display a metric value
 * at the given resolution. E.g. resolution=1mm in cm → 1 decimal place.
 */
export function getMetricDecimalPlaces(
  resolutionMm: number,
  unit: UnitDefinition,
): number {
  const stepInUnit = resolutionMm / unit.toBase;
  return Math.max(0, Math.ceil(-Math.log10(stepInUnit)));
}

// --- Helpers ---

export function getBaseUnit(config: UnitConfig): UnitDefinition {
  return config.units[0];
}

export function findUnitByAlias(
  config: UnitConfig,
  alias: string,
): UnitDefinition | undefined {
  const lower = alias.toLowerCase();
  return config.units.find((u) =>
    u.aliases.some((a) => a.toLowerCase() === lower),
  );
}

export function convertToBase(value: number, unit: UnitDefinition): number {
  return value * unit.toBase;
}

export function convertFromBase(
  baseValue: number,
  unit: UnitDefinition,
): number {
  return baseValue / unit.toBase;
}
