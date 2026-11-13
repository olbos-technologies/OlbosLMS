'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiClientError } from '@/lib/api';
import { SessionProvider } from '@/components/session';

/**
 * Client providers.
 *
 * The retry policy matters for a compliance tool: a 401 or a 403 is an answer,
 * not a transient failure, and retrying it three times only delays telling the
 * user what happened.
 */
export const Providers = ({ children }: { children: ReactNode }): ReactNode => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiClientError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
};
