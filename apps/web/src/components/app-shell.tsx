'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as icons from 'lucide-react';
import { Avatar, Button, cn, Skeleton } from '@olbos/ui';
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
  const [navSearch, setNavSearch] = useState('');
  const mobilePanel = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const activeItem = navigation
    .flatMap((section) => section.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const pageLabel = (label: string) => (label === 'Command Center' ? 'Overview' : label);
  const seen = new Set<string>();
  const visibleNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (seen.has(item.href)) return false;
        seen.add(item.href);
        return pageLabel(item.label).toLowerCase().includes(navSearch.trim().toLowerCase());
      }),
    }))
    .filter((section) => section.items.length);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobilePanel.current?.querySelector<HTMLElement>('button, a, input')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavOpen(false);
      }
      if (event.key !== 'Tab') return;
      const controls = [
        ...(mobilePanel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input',
        ) ?? []),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const resized = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) setMobileNavOpen(false);
    };
    document.addEventListener('keydown', keydown);
    window.addEventListener('resize', resized);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', resized);
      if (window.matchMedia('(max-width: 1023px)').matches)
        menuTrigger.current?.focus({ preventScroll: true });
      else previous?.focus({ preventScroll: true });
    };
  }, [mobileNavOpen]);

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
      <div className="portal-sidebar-heading">
        <Link href="/dashboard" className="portal-wordmark">
          Learning portal
        </Link>
        <p>Education & training workspace</p>
      </div>
      <div className="portal-nav-search">
        <icons.Search size={15} aria-hidden="true" />
        <input
          aria-label="Find a page"
          type="search"
          placeholder="Find a page…"
          value={navSearch}
          onChange={(event) => setNavSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setNavSearch('');
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {visibleNavigation.map((section) => (
          <div key={section.id} className="mb-4">
            <p className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-subtle uppercase">
              {section.label === 'Command Center' ? 'Workspace' : section.label}
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
                      onClick={() => setNavSearch('')}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'portal-nav-link flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                        active
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                      )}
                    >
                      <Icon name={item.icon} className="size-4 shrink-0" />
                      <span className="truncate">{pageLabel(item.label)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!visibleNavigation.length && (
          <div className="p-3 text-xs leading-6 text-ink-muted">
            No pages match “{navSearch}”.
            <button
              className="mt-2 block font-medium text-brand-700"
              onClick={() => setNavSearch('')}
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Avatar firstName={me.user.firstName} lastName={me.user.lastName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">
              {me.user.firstName} {me.user.lastName}
            </p>
            <p className="truncate text-[11px] text-ink-muted">Signed in</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] capitalize text-ink-muted">
          {me.roles
            .slice(0, 2)
            .map((role) => role.key.replaceAll('_', ' ').toLowerCase())
            .join(' · ')}
        </p>
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
    <div className="portal-shell flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only-focusable absolute top-2 left-2 z-50 rounded bg-brand-600 px-3 py-2 text-sm text-white"
      >
        Skip to content
      </a>

      <aside
        className="portal-sidebar hidden w-64 shrink-0 border-r border-border bg-surface lg:block"
        inert={mobileNavOpen || undefined}
      >
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            tabIndex={-1}
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            ref={mobilePanel}
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="portal-mobile-panel absolute inset-y-0 left-0 w-72 bg-surface shadow-xl"
          >
            <button
              className="portal-mobile-close"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
            >
              <icons.X size={18} aria-hidden="true" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col" inert={mobileNavOpen || undefined}>
        <header className="portal-topbar sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <Button
            ref={menuTrigger}
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
              <>
                <span className="hidden font-normal text-ink-muted sm:inline">
                  Workspace <span className="mx-2 text-ink-subtle">/</span>
                </span>
                {pageLabel(
                  activeItem?.label ??
                    (pathname === '/training' ? 'Required Training' : 'Workspace'),
                )}
              </>
            </p>
          </div>
          <Link href="/catalog" className="portal-utility-link hidden sm:inline-flex">
            Browse courses
          </Link>
          <Link href="/learning" className="portal-utility-link">
            My learning
          </Link>
        </header>

        <main id="main" className="portal-main min-w-0 flex-1">
          <div className="portal-content">{children}</div>
        </main>
        <footer className="portal-footer">
          Learning, training & records<span>Access is managed by your administrator</span>
        </footer>
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
  <header className="portal-page-header">
    <div className="min-w-0">
      <p className="portal-eyebrow">Learning & training workspace</p>
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
    </div>
    {actions ? (
      <div className="portal-page-actions flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </header>
);
