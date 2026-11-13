'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as icons from 'lucide-react';
import { Avatar, Badge, Button, cn, Skeleton } from '@olbos/ui';
import { api } from '@/lib/api';
import { useSession } from './session';

/**
 * The application shell: role-aware sidebar, header and content region.
 *
 * The sidebar is rendered from `/api/v1/me/navigation`, which the API builds
 * from the same permission and entitlement checks it enforces. A user therefore
 * cannot be shown a section the API would refuse — the menu and the
 * authorization rules cannot drift apart, because they are the same code.
 */

const Icon = ({ name, className }: { name: string; className?: string }): ReactNode => {
  const Component = (icons as unknown as Record<string, icons.LucideIcon | undefined>)[name];
  const Fallback = icons.Circle;
  const Resolved = Component ?? Fallback;
  return <Resolved className={className} aria-hidden="true" />;
};

export const AppShell = ({ children }: { children: ReactNode }): ReactNode => {
  const { me, navigation, isLoading, error } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (error?.isUnauthenticated) router.replace('/login');
  }, [error, router]);

  // Close the mobile drawer on navigation, or it covers the page just reached.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const signOut = async (): Promise<void> => {
    await api.post('/api/v1/auth/logout').catch(() => undefined);
    // Drop every cached response before leaving. Without this the next person
    // to sign in on this browser briefly sees the previous user's identity,
    // navigation and data from the query cache.
    queryClient.clear();
    router.replace('/login');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-64 border-r border-border bg-surface p-4 lg:block">
          <Skeleton className="h-8 w-32" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-7 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-64" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!me) return null;

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="grid size-7 place-items-center rounded bg-brand-600 text-xs font-bold text-white">
          O
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">OLBOS</p>
          <p className="truncate text-[11px] text-ink-subtle">{me.organization?.name}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {navigation.map((section) => (
          <div key={section.id} className="mb-4">
            <p className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-subtle uppercase">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                        active
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                      )}
                    >
                      <Icon name={item.icon} className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Avatar firstName={me.user.firstName} lastName={me.user.lastName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">
              {me.user.firstName} {me.user.lastName}
            </p>
            <p className="truncate text-[11px] text-ink-subtle">{me.user.email}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {me.roles.slice(0, 2).map((role) => (
            <Badge key={role.key} tone="brand">
              {role.key.replaceAll('_', ' ').toLowerCase()}
            </Badge>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 w-full justify-start"
          icon={<icons.LogOut className="size-3.5" aria-hidden="true" />}
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only-focusable absolute top-2 left-2 z-50 rounded bg-brand-600 px-3 py-2 text-sm text-white"
      >
        Skip to content
      </a>

      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
            icon={<icons.Menu className="size-4" aria-hidden="true" />}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {me.organization?.name ?? 'OLBOS'}
            </p>
          </div>
          <Link
            href="/learning"
            className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            My learning
          </Link>
        </header>

        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}): ReactNode => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
);
