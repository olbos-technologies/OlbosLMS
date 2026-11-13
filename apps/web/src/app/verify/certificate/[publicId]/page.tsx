import type { Metadata } from 'next';
import { API_URL } from '@/lib/api';
import type { VerificationPayload } from '@/lib/types';

/**
 * Public certificate verification (§17).
 *
 * Rendered on the server with no session: the audience is an auditor, a client
 * or a prospective employer holding a printed certificate. It shows exactly
 * enough to confirm the credential and nothing more about the person, and it
 * states the training's representation plainly rather than implying an
 * authorisation the issuer does not hold.
 */

export const metadata: Metadata = {
  title: 'Verify certificate',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RESULT_STYLES: Record<
  VerificationPayload['result'],
  { label: string; className: string; glyph: string }
> = {
  VALID: {
    label: 'Valid',
    className: 'bg-status-current-bg text-status-current border-status-current/30',
    glyph: '✓',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-status-expiring-bg text-status-expiring border-status-expiring/30',
    glyph: '!',
  },
  REVOKED: {
    label: 'Revoked',
    className: 'bg-status-expired-bg text-status-expired border-status-expired/30',
    glyph: '×',
  },
  SUPERSEDED: {
    label: 'Superseded',
    className: 'bg-status-pending-bg text-status-pending border-status-pending/30',
    glyph: '↻',
  },
  NOT_FOUND: {
    label: 'Not found',
    className: 'bg-status-missing-bg text-status-missing border-status-missing/30',
    glyph: '—',
  },
  TAMPERED: {
    label: 'Cannot be verified',
    className: 'bg-status-expired-bg text-status-expired border-status-expired/30',
    glyph: '⚠',
  },
};

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
};

const titleCase = (value?: string): string =>
  (value ?? '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const fetchVerification = async (publicId: string): Promise<VerificationPayload> => {
  try {
    const response = await fetch(`${API_URL}/verify/certificate/${encodeURIComponent(publicId)}`, {
      cache: 'no-store',
    });
    const body = (await response.json()) as { data?: VerificationPayload };
    if (body.data) return body.data;
  } catch {
    // Fall through to the generic answer below.
  }

  return {
    result: 'NOT_FOUND',
    verifiedAt: new Date().toISOString(),
    message: 'This certificate could not be checked right now. Please try again shortly.',
  };
};

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const payload = await fetchVerification(publicId);
  const style = RESULT_STYLES[payload.result];
  const found = payload.result !== 'NOT_FOUND' && payload.result !== 'TAMPERED';

  return (
    <main className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded bg-brand-600 text-xs font-bold text-white">
            O
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">OLBOS Certificate Verification</p>
            <p className="text-xs text-ink-muted">Independent check of a training certificate</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <div className={`flex items-center gap-3 border-b px-5 py-4 ${style.className}`}>
            <span aria-hidden="true" className="text-2xl leading-none font-bold">
              {style.glyph}
            </span>
            <div>
              <p className="text-base font-semibold">{style.label}</p>
              <p className="text-xs opacity-90">{payload.message}</p>
            </div>
          </div>

          {found ? (
            <div className="px-5 py-5">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail label="Certificate number" value={payload.certificateNumber} mono />
                <Detail label="Issued by" value={payload.organizationName} />
                <Detail label="Issued to" value={payload.learnerName} />
                <Detail label="Course" value={payload.courseTitle} />
                <Detail label="Completed" value={formatDate(payload.completedAt)} />
                <Detail label="Issued" value={formatDate(payload.issuedAt)} />
                <Detail
                  label="Expires"
                  value={payload.expiresAt ? formatDate(payload.expiresAt) : 'Does not expire'}
                />
                <Detail label="Instructor" value={payload.instructorName ?? '—'} />
                <Detail
                  label="Duration"
                  value={
                    payload.durationMinutes
                      ? `${payload.durationMinutes} minutes${
                          payload.creditHours ? ` (${payload.creditHours} credit hours)` : ''
                        }`
                      : '—'
                  }
                />
                <Detail label="Recorded as" value={titleCase(payload.trainingType)} />
              </dl>

              {payload.revokedAt ? (
                <p className="mt-5 rounded-md border border-status-expired/25 bg-status-expired-bg px-3 py-2 text-xs text-status-expired">
                  Revoked by the issuing organization on {formatDate(payload.revokedAt)}.
                </p>
              ) : null}

              {payload.disclaimer ? (
                // §10: what this certificate does and does not represent,
                // stated to the person relying on it.
                <div className="mt-5 rounded-md border border-border bg-surface-muted px-3 py-2.5">
                  <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                    What this certificate represents
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {payload.disclaimer}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="px-5 py-8">
              <p className="text-sm text-ink-muted">
                {payload.result === 'TAMPERED'
                  ? 'This certificate record did not pass its integrity check. Contact the issuing organization directly before relying on it.'
                  : 'Check the code on the certificate and try again. Codes are 12 characters and contain no letter O, letter I, digit 0 or digit 1.'}
              </p>
            </div>
          )}

          <div className="border-t border-border bg-surface-muted px-5 py-3">
            <p className="text-[11px] text-ink-subtle">
              Checked {new Date(payload.verifiedAt).toISOString().replace('T', ' ').slice(0, 19)}{' '}
              UTC. This page confirms what the issuing organization recorded in OLBOS. It is not a
              statement by OLBOS about the holder&apos;s competence, nor about compliance with any
              law or regulation.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

const Detail = ({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) => (
  <div>
    <dt className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">{label}</dt>
    <dd className={`mt-0.5 text-sm text-ink ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</dd>
  </div>
);
