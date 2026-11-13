import type { ReactNode } from 'react';
import './academy.css';

export default function AcademyLayout({ children }: { children: ReactNode }) {
  return <div className="academy-workspace">{children}</div>;
}
