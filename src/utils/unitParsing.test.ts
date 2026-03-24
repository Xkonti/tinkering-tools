import { describe, expect, it } from 'vitest';
import {
  decimalToFraction,
  formatDistance,
  formatImperial,
  formatMetric,
  isValidPartialInput,
  parseFraction,
  parseUnitInput,
} from './unitParsing';
import { DISTANCE_UNITS } from './units';
import type { UnitDefinition } from './units';

const config = DISTANCE_UNITS;
const INCH_MM = 25.4;
const FOOT_MM = 304.8;

function inchUnit(): UnitDefinition {
  return config.units.find((u) => u.symbol === 'in')!;
}

function footUnit(): UnitDefinition {
  return config.units.find((u) => u.symbol === 'ft')!;
}

function mmUnit(): UnitDefinition {
  return config.units[0];
}

function cmUnit(): UnitDefinition {
  return config.units.find((u) => u.symbol === 'cm')!;
}

// ============================================================
// parseFraction
// ============================================================

describe('parseFraction', () => {
  it('parses simple fractions', () => {
    expect(parseFraction('3/16')).toBeCloseTo(3 / 16);
    expect(parseFraction('1/2')).toBeCloseTo(0.5);
    expect(parseFraction('7/8')).toBeCloseTo(7 / 8);
    expect(parseFraction('1/32')).toBeCloseTo(1 / 32);
  });

  it('returns null for invalid fractions', () => {
    expect(parseFraction('7/0')).toBeNull();
    expect(parseFraction('abc')).toBeNull();
    expect(parseFraction('3')).toBeNull();
    expect(parseFraction('3/')).toBeNull();
    expect(parseFraction('/4')).toBeNull();
  });

  it('handles zero numerator', () => {
    expect(parseFraction('0/5')).toBe(0);
  });
});

// ============================================================
// decimalToFraction
// ============================================================

describe('decimalToFraction', () => {
  it('converts exact fractions', () => {
    expect(decimalToFraction(0.5, 32)).toEqual({ whole: 0, num: 1, den: 2 });
    expect(decimalToFraction(0.25, 32)).toEqual({ whole: 0, num: 1, den: 4 });
    expect(decimalToFraction(0.75, 32)).toEqual({ whole: 0, num: 3, den: 4 });
  });

  it('converts mixed numbers', () => {
    const r = decimalToFraction(1.1875, 32);
    expect(r).toEqual({ whole: 1, num: 3, den: 16 });
  });

  it('uses ceil rounding (result >= input)', () => {
    // 0.1 in 1/32nds = 3.2/32 → ceil to 4/32 = 1/8
    const r = decimalToFraction(0.1, 32);
    expect(r.whole).toBe(0);
    expect(r.num / r.den).toBeGreaterThanOrEqual(0.1);
  });

  it('handles whole numbers exactly', () => {
    expect(decimalToFraction(3, 32)).toEqual({ whole: 3, num: 0, den: 1 });
  });

  it('handles zero', () => {
    expect(decimalToFraction(0, 32)).toEqual({ whole: 0, num: 0, den: 1 });
  });

  it('simplifies fractions', () => {
    // 0.5 with maxDenom=32 → 16/32 → simplified to 1/2
    expect(decimalToFraction(0.5, 32)).toEqual({ whole: 0, num: 1, den: 2 });
  });

  it('rounds up to next whole when fraction rounds to maxDenom', () => {
    // 0.999 with maxDenom=32 → ceil(31.968) = 32/32 → whole + 1
    const r = decimalToFraction(0.999, 32);
    expect(r).toEqual({ whole: 1, num: 0, den: 1 });
  });
});

// ============================================================
// parseUnitInput — Imperial formats
// ============================================================

describe('parseUnitInput — imperial', () => {
  // --- Feet + inches + fraction ---

  it('parses "1ft 3in 3/16"', () => {
    const r = parseUnitInput('1ft 3in 3/16', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(1 * FOOT_MM + (3 + 3 / 16) * INCH_MM);
    expect(r!.unitSymbol).toBe('ft');
  });

  it('parses "1ft 3 3/16in"', () => {
    const r = parseUnitInput('1ft 3 3/16in', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(1 * FOOT_MM + (3 + 3 / 16) * INCH_MM);
  });

  it('parses "1ft 3-3/16in"', () => {
    const r = parseUnitInput('1ft 3-3/16in', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(1 * FOOT_MM + (3 + 3 / 16) * INCH_MM);
  });

  it('parses "3\' 3" 3/16"', () => {
    const r = parseUnitInput('3\' 3" 3/16', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(3 * FOOT_MM + (3 + 3 / 16) * INCH_MM);
  });

  it('parses "3\' 3 3/16\\""', () => {
    const r = parseUnitInput('3\' 3 3/16"', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(3 * FOOT_MM + (3 + 3 / 16) * INCH_MM);
  });

  it('parses "3\' 3-3/16\\""', () => {
    const r = parseUnitInput('3\' 3-3/16"', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(3 * FOOT_MM + (3 + 3 / 16) * INCH_MM);
  });

  // --- Inches + fraction ---

  it('parses "23in 3/32"', () => {
    const r = parseUnitInput('23in 3/32', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo((23 + 3 / 32) * INCH_MM);
    expect(r!.unitSymbol).toBe('in');
  });

  it('parses "23 3/32in"', () => {
    const r = parseUnitInput('23 3/32in', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo((23 + 3 / 32) * INCH_MM);
  });

  it('parses "23-3/32in"', () => {
    const r = parseUnitInput('23-3/32in', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo((23 + 3 / 32) * INCH_MM);
  });

  it('parses "23\\" 5/8"', () => {
    const r = parseUnitInput('23" 5/8', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo((23 + 5 / 8) * INCH_MM);
  });

  it('parses "23 5/8\\""', () => {
    const r = parseUnitInput('23 5/8"', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo((23 + 5 / 8) * INCH_MM);
  });

  it('parses "23-5/8\\""', () => {
    const r = parseUnitInput('23-5/8"', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo((23 + 5 / 8) * INCH_MM);
  });

  // --- Pure fraction ---

  it('parses "3/64in"', () => {
    const r = parseUnitInput('3/64in', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo((3 / 64) * INCH_MM);
  });

  it('parses "5/128\\""', () => {
    const r = parseUnitInput('5/128"', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo((5 / 128) * INCH_MM);
  });

  // --- Decimal ---

  it('parses "5.5in"', () => {
    const r = parseUnitInput('5.5in', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(5.5 * INCH_MM);
  });

  it('parses "5.5\\""', () => {
    const r = parseUnitInput('5.5"', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(5.5 * INCH_MM);
  });

  it('parses "3.2ft"', () => {
    const r = parseUnitInput('3.2ft', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(3.2 * FOOT_MM);
  });

  it('parses "3.2\'"', () => {
    const r = parseUnitInput("3.2'", config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(3.2 * FOOT_MM);
  });

  // --- Feet + inches (no fraction) ---

  it('parses "3ft 6in"', () => {
    const r = parseUnitInput('3ft 6in', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(3 * FOOT_MM + 6 * INCH_MM);
  });

  it('parses "3\' 6\\""', () => {
    const r = parseUnitInput('3\' 6"', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(3 * FOOT_MM + 6 * INCH_MM);
  });

  // --- Invalid ---

  it('returns null for bare number without unit', () => {
    expect(parseUnitInput('23', config)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseUnitInput('', config)).toBeNull();
  });
});

// ============================================================
// parseUnitInput — Metric formats
// ============================================================

describe('parseUnitInput — metric', () => {
  it('parses "32.5mm"', () => {
    const r = parseUnitInput('32.5mm', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(32.5);
    expect(r!.unitSymbol).toBe('mm');
  });

  it('parses "5.4cm"', () => {
    const r = parseUnitInput('5.4cm', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(54);
  });

  it('parses "0.6dm"', () => {
    const r = parseUnitInput('0.6dm', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(60);
  });

  it('parses "2.13m"', () => {
    const r = parseUnitInput('2.13m', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(2130);
  });

  it('parses integer metric "100mm"', () => {
    const r = parseUnitInput('100mm', config);
    expect(r).not.toBeNull();
    expect(r!.baseValue).toBeCloseTo(100);
  });
});

// ============================================================
// formatImperial
// ============================================================

describe('formatImperial', () => {
  it('formats whole inches', () => {
    expect(formatImperial(5 * INCH_MM, 32, false)).toBe('5in');
  });

  it('formats inches with fraction', () => {
    const mm = (23 + 3 / 32) * INCH_MM;
    expect(formatImperial(mm, 32, false)).toBe('23 3/32in');
  });

  it('formats pure fraction', () => {
    const mm = (3 / 16) * INCH_MM;
    expect(formatImperial(mm, 32, false)).toBe('3/16in');
  });

  it('formats feet + inches when preferFeet is true', () => {
    const mm = 1 * FOOT_MM + (3 + 3 / 16) * INCH_MM;
    expect(formatImperial(mm, 32, true)).toBe('1ft 3 3/16in');
  });

  it('formats feet with no remaining inches', () => {
    const mm = 3 * FOOT_MM;
    expect(formatImperial(mm, 32, true)).toBe('3ft');
  });

  it('uses ceil rounding', () => {
    // 0.1 inches = 2.54mm; 0.1 = 3.2/32 → ceil to 4/32 = 1/8
    const mm = 0.1 * INCH_MM;
    const result = formatImperial(mm, 32, false);
    expect(result).toBe('1/8in');
  });

  it('formats zero', () => {
    expect(formatImperial(0, 32, false)).toBe('0in');
  });
});

// ============================================================
// formatMetric
// ============================================================

describe('formatMetric', () => {
  it('formats mm', () => {
    expect(formatMetric(32.5, mmUnit())).toBe('32.5mm');
  });

  it('formats cm', () => {
    expect(formatMetric(54, cmUnit())).toBe('5.4cm');
  });

  it('strips trailing zeros', () => {
    expect(formatMetric(100, mmUnit())).toBe('100mm');
  });

  it('limits to 4 decimal places', () => {
    expect(formatMetric(1.00001, mmUnit())).toBe('1mm');
  });
});

// ============================================================
// formatDistance
// ============================================================

describe('formatDistance', () => {
  it('dispatches to imperial for fractional units', () => {
    const mm = 5 * INCH_MM;
    expect(formatDistance(mm, inchUnit())).toBe('5in');
  });

  it('dispatches to metric for non-fractional units', () => {
    expect(formatDistance(100, mmUnit())).toBe('100mm');
  });

  it('uses feet formatting for foot unit', () => {
    const mm = 2 * FOOT_MM + 6 * INCH_MM;
    expect(formatDistance(mm, footUnit())).toBe('2ft 6in');
  });
});

// ============================================================
// Round-trip tests
// ============================================================

describe('round-trip: parse → format → parse', () => {
  it('round-trips imperial inches', () => {
    const original = '23 3/32in';
    const parsed = parseUnitInput(original, config);
    expect(parsed).not.toBeNull();
    const formatted = formatImperial(parsed!.baseValue, 32, false);
    const reparsed = parseUnitInput(formatted, config);
    expect(reparsed).not.toBeNull();
    expect(reparsed!.baseValue).toBeCloseTo(parsed!.baseValue);
  });

  it('round-trips imperial feet + inches (ceil rounding means reparsed >= original)', () => {
    const original = '3ft 6 1/4in';
    const parsed = parseUnitInput(original, config);
    expect(parsed).not.toBeNull();
    const formatted = formatImperial(parsed!.baseValue, 32, true);
    const reparsed = parseUnitInput(formatted, config);
    expect(reparsed).not.toBeNull();
    // Ceil rounding: reparsed >= original, but within 1/32 inch
    expect(reparsed!.baseValue).toBeGreaterThanOrEqual(parsed!.baseValue - 0.01);
    expect(reparsed!.baseValue - parsed!.baseValue).toBeLessThan(INCH_MM / 32 + 0.01);
  });

  it('round-trips metric mm', () => {
    const original = '32.5mm';
    const parsed = parseUnitInput(original, config);
    expect(parsed).not.toBeNull();
    const formatted = formatMetric(parsed!.baseValue, mmUnit());
    const reparsed = parseUnitInput(formatted, config);
    expect(reparsed).not.toBeNull();
    expect(reparsed!.baseValue).toBeCloseTo(parsed!.baseValue);
  });
});

// ============================================================
// isValidPartialInput
// ============================================================

describe('isValidPartialInput', () => {
  it('accepts empty string', () => {
    expect(isValidPartialInput('')).toBe(true);
  });

  it('accepts digits', () => {
    expect(isValidPartialInput('123')).toBe(true);
  });

  it('accepts partial imperial', () => {
    expect(isValidPartialInput('3ft')).toBe(true);
    expect(isValidPartialInput('3ft 5')).toBe(true);
    expect(isValidPartialInput('23 3/16in')).toBe(true);
  });

  it('accepts partial metric', () => {
    expect(isValidPartialInput('32.5m')).toBe(true);
  });

  it('rejects special characters', () => {
    expect(isValidPartialInput('3@in')).toBe(false);
    expect(isValidPartialInput('3#mm')).toBe(false);
  });

  it('rejects double dots', () => {
    expect(isValidPartialInput('3..5mm')).toBe(false);
  });

  it('rejects double slashes', () => {
    expect(isValidPartialInput('3//5in')).toBe(false);
  });

  it('rejects double spaces', () => {
    expect(isValidPartialInput('3  5in')).toBe(false);
  });
});
