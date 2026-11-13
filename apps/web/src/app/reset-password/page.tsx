'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Field, Input } from '@olbos/ui';
import { api, ApiClientError } from '@/lib/api';

export default function ResetPasswordPage() {
  const cache = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const resetToken = hash.get('token');
    if (resetToken) {
      setToken(resetToken);
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    setReady(true);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      const result = token
        ? await api.post<{ message: string }>('/api/v1/auth/password/reset', {
            token,
            password: fields.get('password'),
          })
        : await api.post<{ message: string }>('/api/v1/auth/password/forgot', {
            email: fields.get('email'),
            organizationSlug: fields.get('organizationSlug') || undefined,
          });
      if (token) cache.clear();
      setMessage(result.data.message);
    } catch (failure) {
      setError(
        failure instanceof ApiClientError
          ? (failure.details[0]?.message ?? failure.message)
          : 'We could not reach the server. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-4">
      <Card className="w-full max-w-sm space-y-5 p-6">
        <h1 className="text-xl font-semibold text-ink">Reset your password</h1>
        {message ? <p role="status">{message}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {ready && !message ? (
          <form onSubmit={submit} className="space-y-4">
            {token ? (
              <Field label="New password" htmlFor="password" required>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </Field>
            ) : (
              <>
                <Field label="Email" htmlFor="email" required>
                  <Input id="email" name="email" type="email" autoComplete="username" required />
                </Field>
                <Field
                  label="Institution workspace code (optional)"
                  htmlFor="organizationSlug"
                  hint="Enter your workspace code if your email is used by more than one institution."
                >
                  <Input
                    id="organizationSlug"
                    name="organizationSlug"
                    autoComplete="organization"
                    maxLength={64}
                  />
                </Field>
              </>
            )}
            <Button type="submit" className="w-full" loading={busy}>
              {token ? 'Reset password' : 'Send reset link'}
            </Button>
            {token && error ? (
              <Link
                href="/reset-password"
                onClick={() => {
                  setToken(null);
                  setError('');
                }}
                className="block text-sm underline"
              >
                Request a new link
              </Link>
            ) : null}
          </form>
        ) : null}
        <Link href="/login" className="block text-sm underline">
          Back to sign in
        </Link>
      </Card>
    </main>
  );
}
