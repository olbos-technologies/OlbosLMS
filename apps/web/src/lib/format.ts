/** Formatting helpers shared by the screens. */

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
};

/** "in 12 days" / "8 days ago" — the phrasing a compliance view needs. */
export const formatRelativeDays = (days: number | null | undefined): string => {
  if (days === null || days === undefined) return '—';
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  const past = Math.abs(days);
  return `${past} day${past === 1 ? '' : 's'} ago`;
};

export const formatMinutes = (minutes: number | null | undefined): string => {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;

export const titleCase = (value: string): string =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

/** Compliance percentage to a KPI tone, using the same thresholds throughout. */
export const complianceTone = (percent: number): 'success' | 'warning' | 'danger' => {
  if (percent >= 95) return 'success';
  if (percent >= 80) return 'warning';
  return 'danger';
};
