import type {
  DisplaySettings,
  RoundingStrategy,
  UnitConfig,
  UnitDefinition,
} from './units';
import {
  DISTANCE_UNITS,
  convertFromBase,
  convertToBase,
  findUnitByAlias,
  getMetricDecimalPlaces,
} from './units';

// ============================================================
// Fraction arithmetic
// ============================================================

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/** Parse a fraction string like "3/16" → 0.1875. Returns null if invalid. */
export function parseFraction(s: string): number | null {
  const match = /^(\d+)\/(\d+)$/.exec(s.trim());
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  if (den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) return null;
  return num / den;
}

/**
 * Convert a decimal value to a mixed number.
 * decimalToFraction(1.1875, 32) → { whole: 1, num: 3, den: 16 }
 * Rounding defaults to ceil (result >= input, safe for woodworking).
 */
export function decimalToFraction(
  value: number,
  maxDenom: number,
  rounding: RoundingStrategy = 'ceil',
): { whole: number; num: number; den: number } {
  if (value < 0) {
    const r = decimalToFraction(-value, maxDenom, rounding);
    return { whole: -r.whole, num: r.num, den: r.den };
  }

  const whole = Math.floor(value);
  const frac = value - whole;

  const roundFn =
    rounding === 'ceil'
      ? Math.ceil
      : rounding === 'floor'
        ? Math.floor
        : Math.round;
  const numerator = roundFn(frac * maxDenom);

  if (numerator >= maxDenom) {
    return { whole: whole + 1, num: 0, den: 1 };
  }

  if (numerator === 0) {
    return { whole, num: 0, den: 1 };
  }

  const g = gcd(numerator, maxDenom);
  return { whole, num: numerator / g, den: maxDenom / g };
}

// ============================================================
// Imperial parsing
// ============================================================

/** Inch and foot toBase constants for DISTANCE_UNITS. */
const INCH_TO_MM = 25.4;
const FOOT_TO_MM = 304.8;

function isImperialInput(input: string): boolean {
  return (
    /(?:ft|in|'|")/.test(input)
  );
}

/**
 * Try to parse a string as an imperial distance.
 * Returns base value in mm and the primary unit symbol detected.
 */
function parseImperialDistance(
  input: string,
): { baseValue: number; unitSymbol: string } | null {
  const s = input.trim();

  // --- Pattern 1: feet + inches + optional fraction ---
  // Covers: 1ft 3in 3/16, 1ft 3 3/16in, 1ft 3-3/16in
  //         3' 3" 3/16,   3' 3 3/16",   3' 3-3/16"
  {
    const re =
      /^(\d+(?:\.\d+)?)\s*(?:ft|')\s+(\d+(?:\.\d+)?)\s*(?:in|")\s+(\d+\/\d+)$/;
    const m = re.exec(s);
    if (m) {
      const feet = Number(m[1]);
      const inches = Number(m[2]);
      const frac = parseFraction(m[3]!);
      if (frac === null) return null;
      return {
        baseValue: feet * FOOT_TO_MM + (inches + frac) * INCH_TO_MM,
        unitSymbol: 'ft',
      };
    }
  }

  // Covers: 1ft 3 3/16in, 1ft 3-3/16in, 3' 3 3/16", 3' 3-3/16"
  {
    const re =
      /^(\d+(?:\.\d+)?)\s*(?:ft|')\s+(\d+)[\s-](\d+\/\d+)\s*(?:in|")$/;
    const m = re.exec(s);
    if (m) {
      const feet = Number(m[1]);
      const whole = Number(m[2]);
      const frac = parseFraction(m[3]!);
      if (frac === null) return null;
      return {
        baseValue: feet * FOOT_TO_MM + (whole + frac) * INCH_TO_MM,
        unitSymbol: 'ft',
      };
    }
  }

  // Covers: 1ft 3in (no fraction), 3' 3"
  {
    const re = /^(\d+(?:\.\d+)?)\s*(?:ft|')\s+(\d+(?:\.\d+)?)\s*(?:in|")$/;
    const m = re.exec(s);
    if (m) {
      const feet = Number(m[1]);
      const inches = Number(m[2]);
      return {
        baseValue: feet * FOOT_TO_MM + inches * INCH_TO_MM,
        unitSymbol: 'ft',
      };
    }
  }

  // --- Pattern 2: inches + optional fraction ---
  // Covers: 23in 3/32, 23" 5/8 (whole + unit + space + fraction)
  {
    const re = /^(\d+(?:\.\d+)?)\s*(?:in|")\s+(\d+\/\d+)$/;
    const m = re.exec(s);
    if (m) {
      const inches = Number(m[1]);
      const frac = parseFraction(m[2]!);
      if (frac === null) return null;
      return {
        baseValue: (inches + frac) * INCH_TO_MM,
        unitSymbol: 'in',
      };
    }
  }

  // Covers: 23 3/32in, 23-3/32in, 23 5/8", 23-5/8"
  {
    const re = /^(\d+)[\s-](\d+\/\d+)\s*(?:in|")$/;
    const m = re.exec(s);
    if (m) {
      const whole = Number(m[1]);
      const frac = parseFraction(m[2]!);
      if (frac === null) return null;
      return {
        baseValue: (whole + frac) * INCH_TO_MM,
        unitSymbol: 'in',
      };
    }
  }

  // --- Pattern 3: pure fraction + unit ---
  // Covers: 3/64in, 5/128"
  {
    const re = /^(\d+\/\d+)\s*(?:in|")$/;
    const m = re.exec(s);
    if (m) {
      const frac = parseFraction(m[1]!);
      if (frac === null) return null;
      return {
        baseValue: frac * INCH_TO_MM,
        unitSymbol: 'in',
      };
    }
  }

  // --- Pattern 4: decimal + unit ---
  // Covers: 5.5in, 5.5", 3.2ft, 3.2', 23in (plain integer with unit)
  {
    const re = /^(\d+(?:\.\d+)?)\s*(?:in|")$/;
    const m = re.exec(s);
    if (m) {
      const inches = Number(m[1]);
      return {
        baseValue: inches * INCH_TO_MM,
        unitSymbol: 'in',
      };
    }
  }
  {
    const re = /^(\d+(?:\.\d+)?)\s*(?:ft|')$/;
    const m = re.exec(s);
    if (m) {
      const feet = Number(m[1]);
      return {
        baseValue: feet * FOOT_TO_MM,
        unitSymbol: 'ft',
      };
    }
  }

  return null;
}

// ============================================================
// Metric parsing
// ============================================================

function parseMetricValue(
  input: string,
  config: UnitConfig,
): { baseValue: number; unitSymbol: string } | null {
  const s = input.trim();
  const re = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/i;
  const m = re.exec(s);
  if (!m) return null;

  const value = Number(m[1]);
  const unitStr = m[2]!;
  const unit = findUnitByAlias(config, unitStr);
  if (!unit || unit.fractional) return null; // skip imperial units here

  return {
    baseValue: convertToBase(value, unit),
    unitSymbol: unit.symbol,
  };
}

// ============================================================
// Unified parser
// ============================================================

export interface ParseResult {
  baseValue: number;
  unitSymbol: string;
}

/**
 * Parse a unit input string into a base-unit value.
 * Tries imperial formats first (if input looks imperial), then metric.
 */
export function parseUnitInput(
  input: string,
  config: UnitConfig,
): ParseResult | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  if (isImperialInput(trimmed)) {
    return parseImperialDistance(trimmed);
  }

  return parseMetricValue(trimmed, config);
}

// ============================================================
// Formatting
// ============================================================

/**
 * Format a base value (mm) as an imperial string.
 * Uses feet + inches when the value is >= 1 foot, otherwise just inches.
 * Fractions are rounded to 1/precision using the given rounding strategy.
 */
export function formatImperial(
  baseMm: number,
  precision: number,
  preferFeet: boolean,
  rounding: RoundingStrategy = 'ceil',
): string {
  const totalInches = baseMm / INCH_TO_MM;

  if (preferFeet && Math.abs(totalInches) >= 12) {
    const totalFeet = totalInches / 12;
    const feetWhole = Math.floor(totalFeet);
    let remainingInches = totalInches - feetWhole * 12;
    // Snap near-zero to zero to avoid floating-point artifacts
    if (Math.abs(remainingInches) < 1e-9) remainingInches = 0;
    const { whole, num, den } = decimalToFraction(remainingInches, precision, rounding);

    const parts: string[] = [`${String(feetWhole)}ft`];
    if (whole > 0 && num > 0) {
      parts.push(`${String(whole)} ${String(num)}/${String(den)}in`);
    } else if (whole > 0) {
      parts.push(`${String(whole)}in`);
    } else if (num > 0) {
      parts.push(`${String(num)}/${String(den)}in`);
    }
    return parts.join(' ');
  }

  // Inches only
  const { whole, num, den } = decimalToFraction(totalInches, precision, rounding);
  if (whole > 0 && num > 0) {
    return `${String(whole)} ${String(num)}/${String(den)}in`;
  }
  if (whole > 0) {
    return `${String(whole)}in`;
  }
  if (num > 0) {
    return `${String(num)}/${String(den)}in`;
  }
  return '0in';
}

/**
 * Format a base value (mm) as a metric string.
 * When resolutionMm is provided, snaps to that resolution using the rounding strategy.
 * Otherwise falls back to 4 decimal places with trailing zeros stripped.
 */
export function formatMetric(
  baseMm: number,
  unit: UnitDefinition,
  resolutionMm?: number,
  rounding?: RoundingStrategy,
): string {
  const raw = convertFromBase(baseMm, unit);

  if (resolutionMm !== undefined) {
    const step = resolutionMm / unit.toBase;
    const roundFn =
      (rounding ?? 'ceil') === 'ceil'
        ? Math.ceil
        : (rounding ?? 'ceil') === 'floor'
          ? Math.floor
          : Math.round;
    const snapped = roundFn(raw / step) * step;
    const decimals = getMetricDecimalPlaces(resolutionMm, unit);
    return `${snapped.toFixed(decimals)}${unit.symbol}`;
  }

  // Fallback: up to 4 decimal places, strip trailing zeros
  const formatted = parseFloat(raw.toFixed(4));
  return `${String(formatted)}${unit.symbol}`;
}

/**
 * Format a base value using the given unit definition.
 * Dispatches to imperial or metric formatting.
 */
export function formatDistance(
  baseMm: number,
  unit: UnitDefinition,
): string {
  if (unit.fractional) {
    const precision = unit.precision ?? 32;
    const preferFeet = unit.symbol === 'ft';
    return formatImperial(baseMm, precision, preferFeet);
  }
  return formatMetric(baseMm, unit);
}

/**
 * Format a base value (mm) using full display settings.
 * Resolves the correct unit and applies precision/rounding.
 */
export function formatDistanceWithSettings(
  baseMm: number,
  settings: DisplaySettings,
): string {
  if (settings.unitSystem === 'imperial') {
    return formatImperial(
      baseMm,
      settings.imperialPrecision,
      true,
      settings.roundingStrategy,
    );
  }

  const unit = DISTANCE_UNITS.units.find(
    (u) => u.symbol === settings.metricUnitSymbol,
  );
  if (!unit) {
    return formatMetric(baseMm, DISTANCE_UNITS.units[0]);
  }
  return formatMetric(
    baseMm,
    unit,
    settings.metricResolutionMm,
    settings.roundingStrategy,
  );
}

// ============================================================
// Partial input validation
// ============================================================

const ALLOWED_CHARS = /^[\d\s./\-a-z'"]*$/i;

/**
 * Check if a partial input string could be the beginning of a valid unit input.
 * Permissive — allows in-progress typing. Full validation on blur.
 */
export function isValidPartialInput(
  partial: string
): boolean {
  if (partial === '') return true;
  if (!ALLOWED_CHARS.test(partial)) return false;
  // No consecutive special characters
  if (/\.\./.test(partial)) return false;
  if (/\/\//.test(partial)) return false;
  if (/\s\s/.test(partial)) return false;
  if (/--/.test(partial)) return false;
  return true;
}
