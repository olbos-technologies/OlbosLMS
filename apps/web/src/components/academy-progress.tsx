'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, ProgressBar } from '@olbos/ui';
import { api } from '@/lib/api';

export function AcademyProgress() {
  const query = useQuery({
    queryKey: ['academy'],
    queryFn: async () =>
      (
        await api.get<{
          courses: { id: string; title: string }[];
          enrollments: { id: string; courseId: string; progressPercent: number }[];
        }>('/api/v1/academy/courses')
      ).data,
  });
  if (!query.data?.enrollments.length) return null;
  return (
    <Card className="mb-6 p-5">
      <h2 className="mb-3 font-semibold text-ink">Certification learning</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {query.data.enrollments.map((e) => (
          <div key={e.id}>
            <Link href={`/academy/learn/${e.id}`} className="text-sm font-medium text-brand-700">
              {query.data.courses.find((c) => c.id === e.courseId)?.title ??
                'Enrolled certification course'}{' '}
              →
            </Link>
            <div className="mt-2">
              <ProgressBar value={e.progressPercent} label="Foundation lesson progress" />
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {e.progressPercent}% of foundation lessons complete
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
