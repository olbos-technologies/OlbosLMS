'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';

/** Every authenticated page renders inside the role-aware shell. */
export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
