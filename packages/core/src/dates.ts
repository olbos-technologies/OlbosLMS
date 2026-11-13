/**
 * Date helpers used by the expiration and requirement engines.
 *
 * Compliance deadlines are calendar-day concepts ("expires on 14 March"), not
 * instants, and every organization declares a timezone. These helpers therefore
 * compare *calendar days in a named timezone* rather than raw millisecond
 * differences, so a certificate does not appear to expire a day early for a
 * plant in another time zone.
 */

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = dayKeyFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayKeyFormatters.set(timeZone, formatter);
  }
  return formatter;
};

export const DEFAULT_TIMEZONE = 'UTC';

/** `YYYY-MM-DD` for an instant, as seen in `timeZone`. */
export const zonedDayKey = (date: Date, timeZone: string = DEFAULT_TIMEZONE): string => {
  try {
    return formatterFor(timeZone).format(date);
  } catch {
    // An unknown timezone must not take down a compliance sweep.
    return formatterFor(DEFAULT_TIMEZONE).format(date);
  }
};

const MS_PER_DAY = 86_400_000;

const dayKeyToUtcMillis = (key: string): number => {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
};

/**
 * Whole calendar days from `from` to `to` in `timeZone`. Positive when `to` is
 * later. Same-day returns 0.
 */
export const daysBetween = (from: Date, to: Date, timeZone: string = DEFAULT_TIMEZONE): number =>
  Math.round(
    (dayKeyToUtcMillis(zonedDayKey(to, timeZone)) -
      dayKeyToUtcMillis(zonedDayKey(from, timeZone))) /
      MS_PER_DAY,
  );

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * MS_PER_DAY);

/** Adds calendar years, clamping 29 February to 28 February in common years. */
export const addYears = (date: Date, years: number): Date => {
  const result = new Date(date.getTime());
  const targetYear = result.getUTCFullYear() + years;
  const month = result.getUTCMonth();
  const day = result.getUTCDate();
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  result.setUTCFullYear(targetYear, month, Math.min(day, lastDayOfTargetMonth));
  return result;
};

/** The instant at which the given day begins in `timeZone`. */
export const startOfZonedDay = (date: Date, timeZone: string = DEFAULT_TIMEZONE): Date => {
  const key = zonedDayKey(date, timeZone);
  const guess = new Date(dayKeyToUtcMillis(key));
  // Correct for the zone offset by re-reading the day key of the guess.
  const offsetDays = daysBetween(guess, date, timeZone);
  return offsetDays === 0 ? guess : new Date(guess.getTime() + offsetDays * MS_PER_DAY);
};

export const isSameZonedDay = (a: Date, b: Date, timeZone: string = DEFAULT_TIMEZONE): boolean =>
  zonedDayKey(a, timeZone) === zonedDayKey(b, timeZone);

export const maxDate = (...dates: (Date | null | undefined)[]): Date | null => {
  const valid = dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  if (valid.length === 0) return null;
  return valid.reduce((latest, current) => (current > latest ? current : latest));
};
