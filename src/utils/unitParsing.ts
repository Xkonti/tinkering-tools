import type { UnitConfig, UnitDefinition } from './units';
import { convertFromBase, convertToBase, findUnitByAlias } from './units';

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
 * Convert a decimal value to a mixed number with ceil rounding.
 * decimalToFraction(1.1875, 32) → { whole: 1, num: 3, den: 16 }
 * Uses ceil so the result is always >= the input (safe for woodworking).
 */
export function decimalToFraction(
  value: number,
  maxDenom: number,
): { whole: number; num: number; den: number } {
  if (value < 0) {
    const r = decimalToFraction(-value, maxDenom);
    return { whole: -r.whole, num: r.num, den: r.den };
  }

  const whole = Math.floor(value);
  const frac = value - whole;

  const numerator = Math.ceil(frac * maxDenom);

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
 * Fractions are ceil-rounded to 1/precision.
 */
export function formatImperial(
  baseMm: number,
  precision: number,
  preferFeet: boolean,
): string {
  const totalInches = baseMm / INCH_TO_MM;

  if (preferFeet && Math.abs(totalInches) >= 12) {
    const totalFeet = totalInches / 12;
    const feetWhole = Math.floor(totalFeet);
    let remainingInches = totalInches - feetWhole * 12;
    // Snap near-zero to zero to avoid floating-point artifacts
    if (Math.abs(remainingInches) < 1e-9) remainingInches = 0;
    const { whole, num, den } = decimalToFraction(remainingInches, precision);

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
  const { whole, num, den } = decimalToFraction(totalInches, precision);
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
 * Strips trailing zeros, max 4 decimal places.
 */
export function formatMetric(
  baseMm: number,
  unit: UnitDefinition,
): string {
  const value = convertFromBase(baseMm, unit);
  // Use up to 4 decimal places, strip trailing zeros
  const formatted = parseFloat(value.toFixed(4));
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
