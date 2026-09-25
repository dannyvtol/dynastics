import { describe, it, expect } from 'vitest';
import {
  detectGap,
  aggregateCalories,
  estimateTDEE,
  classifyBMI,
  classifyWaist,
} from './calculations.js';

// ---------------------------------------------------------------------------
// detectGap
// ---------------------------------------------------------------------------

describe('detectGap', () => {
  it('returns empty trimmedDates and no gap for an empty array', () => {
    expect(detectGap([])).toEqual({
      trimmedDates: [],
      gapFound: false,
    });
  });

  it('returns the original dates and no gap when all dates are within maxGapDays', () => {
    const dates = [
      new Date('2026-01-01'),
      new Date('2026-01-03'),
      new Date('2026-01-05'),
    ];
    const result = detectGap(dates, 7);
    expect(result.gapFound).toBe(false);
    expect(result.trimmedDates).toHaveLength(3);
  });

  it('detects a gap and trims everything before it', () => {
    const before = [new Date('2026-01-01'), new Date('2026-01-02')];
    const after  = [new Date('2026-01-12'), new Date('2026-01-13')]; // 10-day gap
    const dates  = [...before, ...after];

    const result = detectGap(dates, 7);
    expect(result.gapFound).toBe(true);
    expect(result.trimmedDates).toHaveLength(2);
    expect(result.trimmedDates[0]).toEqual(new Date('2026-01-12'));
  });

  it('trims to the segment after the LAST gap when multiple gaps exist', () => {
    const dates = [
      new Date('2026-01-01'),
      new Date('2026-01-15'), // gap 1 (14 days)
      new Date('2026-01-16'),
      new Date('2026-01-30'), // gap 2 (14 days)
      new Date('2026-01-31'),
      new Date('2026-02-01'),
    ];

    const result = detectGap(dates, 7);
    expect(result.gapFound).toBe(true);
    expect(result.trimmedDates).toHaveLength(3);
    expect(result.trimmedDates[0]).toEqual(new Date('2026-01-30'));
  });

  it('does not flag a gap equal to maxGapDays (strictly greater-than)', () => {
    const dates = [
      new Date('2026-01-01'),
      new Date('2026-01-08'), // exactly 7 days
    ];
    const result = detectGap(dates, 7);
    expect(result.gapFound).toBe(false);
  });

  it('flags a gap of maxGapDays + 1 day', () => {
    const dates = [
      new Date('2026-01-01'),
      new Date('2026-01-09'), // 8 days
    ];
    const result = detectGap(dates, 7);
    expect(result.gapFound).toBe(true);
  });

  it('works with a custom maxGapDays', () => {
    const dates = [
      new Date('2026-01-01'),
      new Date('2026-01-04'), // 3-day gap
    ];
    expect(detectGap(dates, 7).gapFound).toBe(false);
    expect(detectGap(dates, 2).gapFound).toBe(true);
  });

  it('sorts unsorted input before detecting gaps', () => {
    const dates = [
      new Date('2026-01-12'),
      new Date('2026-01-01'),
      new Date('2026-01-13'),
    ];
    const result = detectGap(dates, 7);
    expect(result.gapFound).toBe(true);
    expect(result.trimmedDates[0]).toEqual(new Date('2026-01-12'));
  });
});

// ---------------------------------------------------------------------------
// aggregateCalories
// ---------------------------------------------------------------------------

describe('aggregateCalories', () => {
  it('returns an empty object for an empty entry array', () => {
    expect(aggregateCalories([])).toEqual({});
  });

  it('sums calories for entries on the same UTC day', () => {
    const entries = [
      { date: new Date('2026-01-03T08:00:00Z'), calories: 500 },
      { date: new Date('2026-01-03T13:00:00Z'), calories: 700 },
      { date: new Date('2026-01-03T19:00:00Z'), calories: 600 },
    ];
    expect(aggregateCalories(entries)).toEqual({ '2026-01-03': 1800 });
  });

  it('places entries on separate days when dates differ', () => {
    const entries = [
      { date: new Date('2026-01-01T12:00:00Z'), calories: 400 },
      { date: new Date('2026-01-02T12:00:00Z'), calories: 600 },
    ];
    expect(aggregateCalories(entries)).toEqual({
      '2026-01-01': 400,
      '2026-01-02': 600,
    });
  });

  it('skips entries with null or missing calories', () => {
    const entries = [
      { date: new Date('2026-01-01T12:00:00Z'), calories: null },
      { date: new Date('2026-01-01T13:00:00Z'), calories: 300 },
    ];
    expect(aggregateCalories(entries)).toEqual({ '2026-01-01': 300 });
  });

  it('skips entries where calories is NaN', () => {
    const entries = [
      { date: new Date('2026-01-02T12:00:00Z'), calories: NaN },
      { date: new Date('2026-01-02T13:00:00Z'), calories: 400 },
    ];
    expect(aggregateCalories(entries)).toEqual({ '2026-01-02': 400 });
  });

  it('uses UTC date for truncation (midnight UTC stays on the same day)', () => {
    const entries = [
      { date: new Date('2026-01-03T00:00:00Z'), calories: 250 },
    ];
    expect(aggregateCalories(entries)).toEqual({ '2026-01-03': 250 });
  });
});

// ---------------------------------------------------------------------------
// estimateTDEE
// ---------------------------------------------------------------------------

describe('estimateTDEE', () => {
  it('returns null with fewer than 2 weigh-ins', () => {
    expect(estimateTDEE([], {})).toBeNull();
    expect(estimateTDEE([{ date: new Date('2026-01-01'), weightKg: 80 }], {})).toBeNull();
  });

  it('returns null when both weigh-ins are on the same date', () => {
    const weights = [
      { date: new Date('2026-01-01'), weightKg: 80 },
      { date: new Date('2026-01-01'), weightKg: 80.2 },
    ];
    expect(estimateTDEE(weights, {})).toBeNull();
  });

  it('estimates TDEE correctly for a maintenance scenario (no weight change)', () => {
    // 7-day period, stable weight, 2000 kcal/day → TDEE = 2000
    const weights = [
      { date: new Date('2026-01-01'), weightKg: 80 },
      { date: new Date('2026-01-08'), weightKg: 80 },
    ];
    const calories = {
      '2026-01-01': 2000, '2026-01-02': 2000, '2026-01-03': 2000,
      '2026-01-04': 2000, '2026-01-05': 2000, '2026-01-06': 2000,
      '2026-01-07': 2000, '2026-01-08': 2000,
    };
    const result = estimateTDEE(weights, calories);
    expect(result).not.toBeNull();
    expect(result.tdee).toBe(2000);
    expect(result.avgDailyCalories).toBe(2000);
    expect(result.weightChangeKgPerWeek).toBe(0);
    expect(result.daysAnalysed).toBe(7);
  });

  it('adjusts TDEE upward when weight is lost (deficit scenario)', () => {
    // Lost 0.5 kg over 7 days eating 2000 kcal/day
    // totalWeightChange = -0.5 kg
    // TDEE = 2000 - (-0.5 * 7700 / 7) = 2000 + 550 = 2550
    const weights = [
      { date: new Date('2026-01-01'), weightKg: 80 },
      { date: new Date('2026-01-08'), weightKg: 79.5 },
    ];
    const calories = {
      '2026-01-01': 2000, '2026-01-02': 2000, '2026-01-03': 2000,
      '2026-01-04': 2000, '2026-01-05': 2000, '2026-01-06': 2000,
      '2026-01-07': 2000, '2026-01-08': 2000,
    };
    const result = estimateTDEE(weights, calories);
    expect(result.tdee).toBe(2550);
    expect(result.weightChangeKgPerWeek).toBeCloseTo(-0.5, 2);
  });

  it('adjusts TDEE downward when weight is gained (surplus scenario)', () => {
    // Gained 0.5 kg over 7 days eating 2500 kcal/day
    // TDEE = 2500 - (0.5 * 7700 / 7) = 2500 - 550 = 1950
    const weights = [
      { date: new Date('2026-01-01'), weightKg: 80 },
      { date: new Date('2026-01-08'), weightKg: 80.5 },
    ];
    const calories = {
      '2026-01-01': 2500, '2026-01-02': 2500, '2026-01-03': 2500,
      '2026-01-04': 2500, '2026-01-05': 2500, '2026-01-06': 2500,
      '2026-01-07': 2500, '2026-01-08': 2500,
    };
    const result = estimateTDEE(weights, calories);
    expect(result.tdee).toBe(1950);
  });

  it('sorts unsorted weightEntries before computing', () => {
    const weights = [
      { date: new Date('2026-01-08'), weightKg: 80 },
      { date: new Date('2026-01-01'), weightKg: 80 },
    ];
    const calories = {
      '2026-01-01': 2000, '2026-01-02': 2000, '2026-01-03': 2000,
      '2026-01-04': 2000, '2026-01-05': 2000, '2026-01-06': 2000,
      '2026-01-07': 2000, '2026-01-08': 2000,
    };
    const result = estimateTDEE(weights, calories);
    expect(result.tdee).toBe(2000);
    expect(result.daysAnalysed).toBe(7);
  });

  it('returns avgDailyCalories of 0 when no calorie data overlaps the weight window', () => {
    const weights = [
      { date: new Date('2026-01-01'), weightKg: 80 },
      { date: new Date('2026-01-08'), weightKg: 80 },
    ];
    const result = estimateTDEE(weights, {});
    expect(result.avgDailyCalories).toBe(0);
    expect(result.tdee).toBe(0);
  });

  it('averages calories by number of logged entries, not by days in the window', () => {
    // 7-day window (Jan 1 → Jan 8), but only 4 calorie entries logged.
    // Total calories = 8000; average = 8000 / 4 = 2000 (not 8000 / 7 ≈ 1143).
    // Stable weight → TDEE = avgDailyCalories = 2000.
    const weights = [
      { date: new Date('2026-01-01'), weightKg: 80 },
      { date: new Date('2026-01-08'), weightKg: 80 },
    ];
    const calories = {
      '2026-01-01': 2100,
      '2026-01-03': 1900,
      '2026-01-05': 2100,
      '2026-01-07': 1900,
    };
    const result = estimateTDEE(weights, calories);
    expect(result.avgDailyCalories).toBe(2000);
    expect(result.tdee).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// classifyBMI
// ---------------------------------------------------------------------------

describe('classifyBMI', () => {
  it('classifies BMI below 18.5 as Underweight / elevated', () => {
    expect(classifyBMI(17)).toEqual({ category: 'Underweight', risk: 'elevated' });
    expect(classifyBMI(18.4)).toEqual({ category: 'Underweight', risk: 'elevated' });
  });

  it('classifies BMI at exactly 18.5 as Normal weight / normal', () => {
    expect(classifyBMI(18.5)).toEqual({ category: 'Normal weight', risk: 'normal' });
  });

  it('classifies BMI in 18.5–24.99 as Normal weight / normal', () => {
    expect(classifyBMI(22)).toEqual({ category: 'Normal weight', risk: 'normal' });
    expect(classifyBMI(24.9)).toEqual({ category: 'Normal weight', risk: 'normal' });
  });

  it('classifies BMI at exactly 25 as Overweight / elevated', () => {
    expect(classifyBMI(25)).toEqual({ category: 'Overweight', risk: 'elevated' });
  });

  it('classifies BMI in 25–29.99 as Overweight / elevated', () => {
    expect(classifyBMI(27.5)).toEqual({ category: 'Overweight', risk: 'elevated' });
  });

  it('classifies BMI at exactly 30 as Obese Class I / high', () => {
    expect(classifyBMI(30)).toEqual({ category: 'Obese Class I', risk: 'high' });
  });

  it('classifies BMI in 30–34.99 as Obese Class I / high', () => {
    expect(classifyBMI(32.7)).toEqual({ category: 'Obese Class I', risk: 'high' });
  });

  it('classifies BMI at exactly 35 as Obese Class II / high', () => {
    expect(classifyBMI(35)).toEqual({ category: 'Obese Class II', risk: 'high' });
  });

  it('classifies BMI in 35–39.99 as Obese Class II / high', () => {
    expect(classifyBMI(37)).toEqual({ category: 'Obese Class II', risk: 'high' });
  });

  it('classifies BMI at exactly 40 as Obese Class III / high', () => {
    expect(classifyBMI(40)).toEqual({ category: 'Obese Class III', risk: 'high' });
  });

  it('classifies BMI above 40 as Obese Class III / high', () => {
    expect(classifyBMI(45)).toEqual({ category: 'Obese Class III', risk: 'high' });
  });
});

// ---------------------------------------------------------------------------
// classifyWaist
// ---------------------------------------------------------------------------

describe('classifyWaist', () => {
  describe('male thresholds', () => {
    it('classifies waist below 94 cm as Normal', () => {
      expect(classifyWaist(80, 'male')).toEqual({ category: 'Normal', risk: 'normal' });
      expect(classifyWaist(93, 'male')).toEqual({ category: 'Normal', risk: 'normal' });
    });

    it('classifies waist at exactly 94 cm as Elevated Risk', () => {
      expect(classifyWaist(94, 'male')).toEqual({ category: 'Elevated Risk', risk: 'elevated' });
    });

    it('classifies waist in 94–101 cm as Elevated Risk', () => {
      expect(classifyWaist(98, 'male')).toEqual({ category: 'Elevated Risk', risk: 'elevated' });
      expect(classifyWaist(101, 'male')).toEqual({ category: 'Elevated Risk', risk: 'elevated' });
    });

    it('classifies waist at exactly 102 cm as High Risk', () => {
      expect(classifyWaist(102, 'male')).toEqual({ category: 'High Risk', risk: 'high' });
    });

    it('classifies waist above 102 cm as High Risk', () => {
      expect(classifyWaist(110, 'male')).toEqual({ category: 'High Risk', risk: 'high' });
    });
  });

  describe('female thresholds', () => {
    it('classifies waist below 80 cm as Normal', () => {
      expect(classifyWaist(70, 'female')).toEqual({ category: 'Normal', risk: 'normal' });
      expect(classifyWaist(79, 'female')).toEqual({ category: 'Normal', risk: 'normal' });
    });

    it('classifies waist at exactly 80 cm as Elevated Risk', () => {
      expect(classifyWaist(80, 'female')).toEqual({ category: 'Elevated Risk', risk: 'elevated' });
    });

    it('classifies waist in 80–87 cm as Elevated Risk', () => {
      expect(classifyWaist(84, 'female')).toEqual({ category: 'Elevated Risk', risk: 'elevated' });
      expect(classifyWaist(87, 'female')).toEqual({ category: 'Elevated Risk', risk: 'elevated' });
    });

    it('classifies waist at exactly 88 cm as High Risk', () => {
      expect(classifyWaist(88, 'female')).toEqual({ category: 'High Risk', risk: 'high' });
    });

    it('classifies waist above 88 cm as High Risk', () => {
      expect(classifyWaist(95, 'female')).toEqual({ category: 'High Risk', risk: 'high' });
    });
  });
});
