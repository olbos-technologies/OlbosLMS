import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

/**
 * Design system primitives (§41).
 *
 * Every component here is presentational and accessible by construction:
 * focus rings are never removed, interactive elements are real buttons and
 * inputs, and anything conveying status carries text as well as colour — a
 * compliance grid must be readable by someone who cannot distinguish red from
 * green.
 */

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-ink-inverse hover:bg-brand-700 disabled:bg-brand-200 disabled:text-white',
  secondary:
    'bg-surface text-ink border border-border-strong hover:bg-surface-muted disabled:text-ink-subtle',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger: 'bg-status-expired text-ink-inverse hover:brightness-95 disabled:opacity-50',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // 32/36/40px tall: dense, but still a comfortable touch target on mobile.
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      // `aria-busy` tells a screen reader the control is working; the spinner
      // alone communicates nothing.
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : icon}
      {children}
    </button>
  );
});

export const Spinner = ({ className }: { className?: string }): ReactNode => (
  <span
    role="presentation"
    className={cn(
      'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
      className ?? 'size-4',
    )}
  />
);

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export const Card = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactNode => (
  <div
    className={cn(
      'rounded-[var(--radius-card)] border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export const CardHeader = ({
  title,
  description,
  actions,
  className,
}: CardHeaderProps): ReactNode => (
  <div
    className={cn(
      'flex items-start justify-between gap-4 border-b border-border px-5 py-4',
      className,
    )}
  >
    <div className="min-w-0">
      <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type ComplianceStatus =
  | 'CURRENT'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'MISSING'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'NOT_APPLICABLE';

interface StatusStyle {
  label: string;
  className: string;
  /** A non-colour cue, so status survives greyscale printing and colour blindness. */
  glyph: string;
}

export const STATUS_STYLES: Record<ComplianceStatus, StatusStyle> = {
  CURRENT: {
    label: 'Current',
    className: 'bg-status-current-bg text-status-current border-status-current/25',
    glyph: '✓',
  },
  EXPIRING_SOON: {
    label: 'Expiring',
    className: 'bg-status-expiring-bg text-status-expiring border-status-expiring/30',
    glyph: '!',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-status-expired-bg text-status-expired border-status-expired/25',
    glyph: '×',
  },
  MISSING: {
    label: 'Missing',
    className: 'bg-status-missing-bg text-status-missing border-status-missing/25',
    glyph: '—',
  },
  IN_PROGRESS: {
    label: 'In progress',
    className: 'bg-status-progress-bg text-status-progress border-status-progress/25',
    glyph: '◐',
  },
  PENDING: {
    label: 'Pending',
    className: 'bg-status-pending-bg text-status-pending border-status-pending/25',
    glyph: '○',
  },
  NOT_APPLICABLE: {
    label: 'N/A',
    className: 'bg-status-na-bg text-status-na border-status-na/25',
    glyph: '·',
  },
};

export interface StatusBadgeProps {
  status: ComplianceStatus;
  className?: string;
  showGlyph?: boolean;
  title?: string;
}

export const StatusBadge = ({
  status,
  className,
  showGlyph = true,
  title,
}: StatusBadgeProps): ReactNode => {
  const style = STATUS_STYLES[status];
  return (
    <span
      title={title ?? style.label}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        style.className,
        className,
      )}
    >
      {showGlyph ? (
        <span aria-hidden="true" className="font-semibold">
          {style.glyph}
        </span>
      ) : null}
      {style.label}
    </span>
  );
};

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-ink-muted border-border',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  success: 'bg-status-current-bg text-status-current border-status-current/25',
  warning: 'bg-status-expiring-bg text-status-expiring border-status-expiring/30',
  danger: 'bg-status-expired-bg text-status-expired border-status-expired/25',
};

export const Badge = ({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}): ReactNode => (
  <span
    className={cn(
      'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
      BADGE_TONES[tone],
      className,
    )}
  >
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

export interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: BadgeTone;
  href?: string;
}

const KPI_TONES: Record<BadgeTone, string> = {
  neutral: 'text-ink',
  brand: 'text-brand-700',
  success: 'text-status-current',
  warning: 'text-status-expiring',
  danger: 'text-status-expired',
};

export const KpiCard = ({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
}: KpiCardProps): ReactNode => (
  <Card className="p-4">
    <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
    <p className={cn('mt-2 text-3xl font-semibold tabular-nums', KPI_TONES[tone])}>
      {value}
      {unit ? <span className="ml-0.5 text-xl font-medium">{unit}</span> : null}
    </p>
    {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
  </Card>
);

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export const ProgressBar = ({
  value,
  label,
  tone = 'brand',
}: {
  value: number;
  label?: string;
  tone?: BadgeTone;
}): ReactNode => {
  const clamped = Math.max(0, Math.min(100, value));
  const fill: Record<BadgeTone, string> = {
    neutral: 'bg-ink-subtle',
    brand: 'bg-brand-600',
    success: 'bg-status-current',
    warning: 'bg-status-expiring',
    danger: 'bg-status-expired',
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <div
        className={cn('h-full rounded-full transition-[width]', fill[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Empty / loading / error states (§61: a feature is not done without these)
// ---------------------------------------------------------------------------

export const EmptyState = ({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}): ReactNode => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    {icon ? <div className="mb-1 text-ink-subtle">{icon}</div> : null}
    <p className="text-sm font-medium text-ink">{title}</p>
    {description ? <p className="max-w-sm text-xs text-ink-muted">{description}</p> : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

export const Skeleton = ({ className }: { className?: string }): ReactNode => (
  <div
    aria-hidden="true"
    className={cn('animate-pulse rounded bg-surface-muted', className ?? 'h-4 w-full')}
  />
);

export const TableSkeleton = ({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) => (
  <div className="space-y-2 p-4" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading</span>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="flex gap-3">
        {Array.from({ length: columns }).map((__, columnIndex) => (
          <Skeleton key={columnIndex} className="h-6 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ALERT_TONES: Record<AlertTone, string> = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  success: 'border-status-current/25 bg-status-current-bg text-status-current',
  warning: 'border-status-expiring/30 bg-status-expiring-bg text-status-expiring',
  danger: 'border-status-expired/25 bg-status-expired-bg text-status-expired',
};

export const Alert = ({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}): ReactNode => (
  <div
    // Errors and warnings are announced; informational notes are not, so a
    // screen reader is not interrupted by a disclaimer.
    role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
    className={cn('rounded-md border px-3 py-2 text-xs', ALERT_TONES[tone], className)}
  >
    {title ? <p className="font-semibold">{title}</p> : null}
    {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
  </div>
);

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export const Field = ({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: FieldProps): ReactNode => (
  <div className="space-y-1">
    <label htmlFor={htmlFor} className="block text-xs font-medium text-ink">
      {label}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-status-expired">
          *
        </span>
      ) : null}
    </label>
    {children}
    {hint && !error ? (
      <p id={`${htmlFor}-hint`} className="text-xs text-ink-subtle">
        {hint}
      </p>
    ) : null}
    {error ? (
      <p id={`${htmlFor}-error`} className="text-xs text-status-expired">
        {error}
      </p>
    ) : null}
  </div>
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink',
          'placeholder:text-ink-subtle disabled:bg-surface-muted disabled:text-ink-subtle',
          'aria-[invalid=true]:border-status-expired',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-ink',
          'disabled:bg-surface-muted disabled:text-ink-subtle',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export const Table = ({ className, children }: { className?: string; children: ReactNode }) => (
  // Wide tables scroll inside their own container, never the page.
  <div className="scroll-x">
    <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>
  </div>
);

export const Th = ({
  className,
  children,
  scope = 'col',
  ...props
}: HTMLAttributes<HTMLTableCellElement> & { scope?: 'col' | 'row' }) => (
  <th
    scope={scope}
    className={cn(
      'border-b border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-ink-muted',
      className,
    )}
    {...props}
  >
    {children}
  </th>
);

export const Td = ({ className, children, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-border px-3 py-2 align-middle', className)} {...props}>
    {children}
  </td>
);

export const Avatar = ({
  firstName,
  lastName,
  className,
}: {
  firstName?: string | null;
  lastName?: string | null;
  className?: string;
}): ReactNode => {
  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700',
        className,
      )}
    >
      {initials}
    </span>
  );
};
