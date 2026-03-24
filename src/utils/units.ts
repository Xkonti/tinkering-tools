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
