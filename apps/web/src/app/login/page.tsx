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
  organizationSlug: z.string().trim().max(64).optional(),
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
      await api.post('/api/v1/auth/login', {
        ...values,
        organizationSlug: values.organizationSlug || undefined,
      });
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
    <div className="portal-login">
      <aside className="portal-login-intro">
        <p className="portal-eyebrow">Education & professional development</p>
        <h2>A focused space for learning and training.</h2>
        <p>
          Access your courses, review assigned training, and keep your learning records in one
          place.
        </p>
        <div className="portal-login-topics">
          <span>Structured learning</span>
          <span>Independent practice</span>
          <span>Training records</span>
        </div>
      </aside>
      <main className="portal-login-main">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <p className="text-2xl font-semibold tracking-tight text-ink">Learning portal</p>
            <p className="mt-2 text-sm text-ink-muted">Your education and training workspace</p>
          </div>
          <Card className="portal-signin-card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-ink">Sign in</h1>
            <p className="mt-0.5 mb-4 text-xs text-ink-muted">
              Use the account your organization issued you.
            </p>

            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              {formError ? <Alert tone="danger">{formError}</Alert> : null}

              <Field
                label="Institution workspace code (optional)"
                htmlFor="organizationSlug"
                hint="Use the code supplied by your institution, especially if your email belongs to more than one workspace."
                error={errors.organizationSlug?.message}
              >
                <Input
                  id="organizationSlug"
                  autoComplete="organization"
                  placeholder="example-college"
                  aria-invalid={!!errors.organizationSlug}
                  {...register('organizationSlug')}
                />
              </Field>

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
      </main>
    </div>
  );
}
