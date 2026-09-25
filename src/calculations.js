/**
 * src/calculations.js — Pure calculation functions for Dynastics (issue #3)
 *
 * All functions operate on plain JS objects with no DOM or file I/O.
 *
 * Date handling note: day-truncation uses UTC (date.toISOString().slice(0, 10)).
 * MyNetDiary exports timestamps in UTC, so exports from non-UTC timezones may
 * attribute midnight-or-later entries to the previous UTC day. A timezone
 * parameter can be added when needed.
 */

// ---------------------------------------------------------------------------
// detectGap
// ---------------------------------------------------------------------------

/**
 * Scan a sorted or unsorted Date array for gaps longer than maxGapDays days.
 * Returns the slice of dates after the last such gap (the most recent
 * continuous segment), plus metadata about whether a trim occurred.
 *
 * @param {Date[]} dates
 * @param {number} [maxGapDays=7]
 * @returns {{ trimmedDates: Date[], gapFound: boolean, trimmedFrom: Date | null }}
 */
export function detectGap(dates, maxGapDays = 7) {
  if (dates.length === 0) {
    return { trimmedDates: [], gapFound: false, trimmedFrom: null };
  }

  const sorted = [...dates].sort((a, b) => a - b);
  const thresholdMs = maxGapDays * 24 * 60 * 60 * 1000;

  let lastGapIndex = -1;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > thresholdMs) {
      lastGapIndex = i;
    }
  }

  if (lastGapIndex === -1) {
    return { trimmedDates: sorted, gapFound: false, trimmedFrom: null };
  }

  const trimmedDates = sorted.slice(lastGapIndex);
  return {
    trimmedDates,
    gapFound: true,
    trimmedFrom: sorted[lastGapIndex],
  };
}

// ---------------------------------------------------------------------------
// aggregateCalories
// ---------------------------------------------------------------------------

/**
 * Sum daily caloric intake from a pre-mapped entry array.
 *
 * The caller is responsible for mapping raw Food-sheet rows to this shape
 * (e.g. row['Calories, cals'] → calories, row['Date & Time'] → date).
 *
 * @param {{ date: Date, calories: number }[]} entries
 * @returns {{ [yyyymmdd: string]: number }}
 */
export function aggregateCalories(entries) {
  /** @type {{ [key: string]: number }} */
  const result = {};

  for (const entry of entries) {
    if (entry.calories == null || isNaN(entry.calories)) continue;
    const key = entry.date.toISOString().slice(0, 10);
    result[key] = (result[key] ?? 0) + entry.calories;
  }

  return result;
}

// ---------------------------------------------------------------------------
// estimateTDEE
// ---------------------------------------------------------------------------

/**
 * Estimate Total Daily Energy Expenditure from weight change and calorie data.
 *
 * Uses the energy-balance equation:
 *   TDEE ≈ avgDailyCalories − (totalWeightChangeKg × 7700 / daysAnalysed)
 *
 * Returns null when fewer than 2 weigh-ins are provided (can't compute delta).
 *
 * @param {{ date: string, weightKg: number }[]} weightEntries  YYYY-MM-DD dates
 * @param {{ [yyyymmdd: string]: number }} caloriesByDate
 * @returns {{ tdee: number, avgDailyCalories: number, weightChangeKgPerWeek: number, daysAnalysed: number } | null}
 */
export function estimateTDEE(weightEntries, caloriesByDate) {
  if (weightEntries.length < 2) return null;

  const sorted = [...weightEntries].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysAnalysed =
    (new Date(last.date) - new Date(first.date)) / msPerDay;

  if (daysAnalysed === 0) return null;

  const totalWeightChangeKg = last.weightKg - first.weightKg;
  const weightChangeKgPerWeek = (totalWeightChangeKg / daysAnalysed) * 7;

  // Average calories over days that fall within the analysed window
  const startDate = first.date;
  const endDate = last.date;
  const calorieDays = Object.entries(caloriesByDate).filter(
    ([d]) => d >= startDate && d <= endDate
  );

  const avgDailyCalories =
    calorieDays.length > 0
      ? calorieDays.reduce((sum, [, v]) => sum + v, 0) / calorieDays.length
      : 0;

  const tdee = avgDailyCalories - (totalWeightChangeKg * 7700) / daysAnalysed;

  return {
    tdee: Math.round(tdee),
    avgDailyCalories: Math.round(avgDailyCalories),
    weightChangeKgPerWeek: Math.round(weightChangeKgPerWeek * 100) / 100,
    daysAnalysed: Math.round(daysAnalysed),
  };
}

// ---------------------------------------------------------------------------
// classifyBMI
// ---------------------------------------------------------------------------

/**
 * Classify a pre-computed BMI value using WHO bands.
 *
 * @param {number} bmi
 * @returns {{ category: string, risk: 'normal' | 'elevated' | 'high' }}
 */
export function classifyBMI(bmi) {
  if (bmi < 18.5) return { category: 'Underweight',    risk: 'elevated' };
  if (bmi < 25)   return { category: 'Normal weight',  risk: 'normal'   };
  if (bmi < 30)   return { category: 'Overweight',     risk: 'elevated' };
  if (bmi < 35)   return { category: 'Obese Class I',  risk: 'high'     };
  if (bmi < 40)   return { category: 'Obese Class II', risk: 'high'     };
  return            { category: 'Obese Class III', risk: 'high'     };
}

// ---------------------------------------------------------------------------
// classifyWaist
// ---------------------------------------------------------------------------

/**
 * Classify waist circumference risk using WHO sex-specific thresholds.
 *
 * Male:   < 94 cm → Normal · 94–101 cm → Elevated Risk · ≥ 102 cm → High Risk
 * Female: < 80 cm → Normal · 80–87 cm  → Elevated Risk · ≥ 88 cm  → High Risk
 *
 * @param {number} waistCm
 * @param {'male' | 'female'} sex
 * @returns {{ category: string, risk: 'normal' | 'elevated' | 'high' }}
 */
export function classifyWaist(waistCm, sex) {
  const [elevatedThreshold, highThreshold] =
    sex === 'male' ? [94, 102] : [80, 88];

  if (waistCm < elevatedThreshold) return { category: 'Normal',        risk: 'normal'   };
  if (waistCm < highThreshold)     return { category: 'Elevated Risk', risk: 'elevated' };
  return                                   { category: 'High Risk',     risk: 'high'     };
}
