'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input } from '@olbos/ui';
import { api, ApiClientError } from '@/lib/api';

/**
 * Sign-in.
 *
 * The form does not tell the user whether the email exists — it repeats the
 * API's single answer for every failure. Client-side validation is limited to
 * shape (is this an email, is the password non-empty), because anything
 * stricter would leak the password policy to an attacker before authentication.
 */

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('/api/v1/auth/login', values);
      // Belt and braces: a cache surviving from a previous session on this
      // browser must never be shown to whoever just signed in.
      queryClient.clear();
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : 'We could not reach the server. Please try again.',
      );
    }
  });

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded bg-brand-600 text-sm font-bold text-white">
            O
          </span>
          <div>
            <p className="text-base font-semibold text-ink">OLBOS LMS</p>
            <p className="text-xs text-ink-muted">Learning, training and safety compliance</p>
          </div>
        </div>

        <Card className="p-5">
          <h1 className="text-sm font-semibold text-ink">Sign in</h1>
          <p className="mt-0.5 mb-4 text-xs text-ink-muted">
            Use the account your organization issued you.
          </p>

          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            {formError ? <Alert tone="danger">{formError}</Alert> : null}

            <Field label="Email" htmlFor="email" error={errors.email?.message} required>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
            </Field>

            <Field label="Password" htmlFor="password" error={errors.password?.message} required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
            </Field>

            <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-[11px] text-ink-subtle">
          Certificates issued by this platform can be checked at{' '}
          <span className="font-mono">/verify/certificate/&lt;code&gt;</span>
        </p>
      </div>
    </div>
  );
}
