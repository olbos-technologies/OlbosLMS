'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api, ApiClientError } from '@/lib/api';
import type { MeResponse, NavigationSection } from '@/lib/types';

/**
 * Session context.
 *
 * `can()` mirrors the server's permission check so the UI can hide what a user
 * cannot do. It is a convenience, never a control: every one of these
 * permissions is re-checked by the API on the actual request, and hiding a
 * button is not what stops an unauthorised call.
 */

interface SessionValue {
  me: MeResponse | null;
  navigation: NavigationSection[];
  isLoading: boolean;
  error: ApiClientError | null;
  can(permission: string): boolean;
  hasEntitlement(key: string): boolean;
  refetch(): void;
}

const SessionContext = createContext<SessionValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }): ReactNode => {
  const meQuery: UseQueryResult<MeResponse, ApiClientError> = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<MeResponse>('/api/v1/me')).data,
    retry: (failureCount, error) =>
      // Never retry an authentication failure: it will keep failing, and the
      // user is waiting to be sent to the sign-in page.
      !(error instanceof ApiClientError && error.isUnauthenticated) && failureCount < 2,
    staleTime: 60_000,
  });

  const navigationQuery = useQuery({
    queryKey: ['navigation'],
    queryFn: async () =>
      (await api.get<NavigationSection[]>('/api/v1/me/navigation', { includePlanned: false })).data,
    enabled: !!meQuery.data,
    staleTime: 300_000,
  });

  const value = useMemo<SessionValue>(() => {
    const permissions = new Set(meQuery.data?.permissions ?? []);
    const entitlements = new Set(meQuery.data?.entitlements ?? []);

    return {
      me: meQuery.data ?? null,
      navigation: navigationQuery.data ?? [],
      isLoading: meQuery.isLoading,
      error: (meQuery.error as ApiClientError) ?? null,
      can: (permission) => permissions.has(permission),
      hasEntitlement: (key) => entitlements.has(key),
      refetch: () => {
        void meQuery.refetch();
        void navigationQuery.refetch();
      },
    };
  }, [meQuery, navigationQuery]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionValue => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
};
