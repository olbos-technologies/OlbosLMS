/**
 * API client.
 *
 * Two things it always does:
 *   * sends the session cookie (`credentials: 'include'`), because the token is
 *     HttpOnly and unreachable from script by design;
 *   * echoes the CSRF cookie back as a header on every mutating request.
 *
 * And one thing it never does: interpret an error itself. The API's error
 * contract carries a code, a message written for a person, and a request id —
 * the UI shows those rather than inventing its own wording.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const CSRF_COOKIE = 'olbos_csrf';

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** True when the plan does not include the feature (§34). */
  get needsUpgrade(): boolean {
    return this.code === 'ENTITLEMENT_REQUIRED' || this.code === 'USAGE_LIMIT_EXCEEDED';
  }
}

const readCsrfToken = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  signal?: AbortSignal;
}

const buildUrl = (path: string, query?: RequestOptions['query']): string => {
  const url = new URL(path.startsWith('http') ? path : `${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(key, entry);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export const apiFetch = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<Envelope<T>> => {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (options.body !== undefined) headers['content-type'] = 'application/json';

  if (method !== 'GET') {
    const csrf = readCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    credentials: 'include',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (response.status === 204) return { data: undefined as T };

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiClientError(response.status, 'UNEXPECTED_RESPONSE', 'Something went wrong.');
    }
    return { data: (await response.text()) as T };
  }

  const payload = (await response.json()) as
    | Envelope<T>
    | { error: { code: string; message: string; details?: ApiErrorDetail[]; requestId?: string } };

  if (!response.ok || 'error' in payload) {
    const error = 'error' in payload ? payload.error : undefined;
    throw new ApiClientError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Something went wrong.',
      error?.details ?? [],
      error?.requestId,
    );
  }

  return payload;
};

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => apiFetch<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

/** Download URL for an export, opened directly so the browser handles the file. */
export const exportUrl = (path: string, query?: RequestOptions['query']): string =>
  buildUrl(path, query);
