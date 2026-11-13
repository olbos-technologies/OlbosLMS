export interface InstitutionSetupInput {
  readonly profileReady: boolean;
  readonly administrators: number;
  readonly programs: number;
  readonly terms: number;
  readonly courses: number;
  readonly sections: number;
}

/** Setup progress reflects persisted structure, never a self-reported checklist. */
export const buildInstitutionSetup = (input: InstitutionSetupInput) => [
  {
    key: 'profile',
    label: 'Institution profile and contact',
    complete: input.profileReady,
    href: '/admin/institution',
  },
  {
    key: 'administrators',
    label: 'Institution administrator assigned',
    complete: input.administrators > 0,
    href: '/admin/institution',
  },
  {
    key: 'programs',
    label: 'First academic program',
    complete: input.programs > 0,
    href: '/campus',
  },
  { key: 'terms', label: 'First academic term', complete: input.terms > 0, href: '/campus' },
  {
    key: 'courses',
    label: 'First academic catalog course',
    complete: input.courses > 0,
    href: '/campus',
  },
  { key: 'sections', label: 'First course section', complete: input.sections > 0, href: '/campus' },
];
