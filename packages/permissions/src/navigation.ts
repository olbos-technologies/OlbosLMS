import { type Permission } from './permissions.js';
import { authorize, type AccessContext } from './policy.js';

/**
 * The OLBOS navigation tree (product spec §7).
 *
 * This is the single source of truth for both the web sidebar and the
 * `GET /api/v1/me/navigation` response, so the menu a user sees is derived from
 * exactly the same permission and entitlement checks the API enforces.
 *
 * `status: 'planned'` marks routes that are specified but not yet implemented.
 * They render disabled rather than being silently dropped, so the roadmap stays
 * visible without shipping dead links.
 */

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: string;
  /** Any one of these permissions reveals the item. */
  readonly anyOf: readonly Permission[];
  /** Entitlement required by the tenant's plan, if any. */
  readonly entitlement?: string;
  readonly status?: 'available' | 'planned';
  readonly badge?: 'expiring' | 'overdue' | 'unread';
}

export interface NavigationSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

export const NAVIGATION: readonly NavigationSection[] = [
  {
    id: 'command-center',
    label: 'Command Center',
    items: [
      {
        id: 'dashboard',
        label: 'Command Center',
        href: '/dashboard',
        icon: 'LayoutDashboard',
        anyOf: ['organization:read'],
      },
    ],
  },
  {
    id: 'discovery',
    label: 'Discovery',
    items: [
      {
        id: 'catalog',
        label: 'Course Catalog',
        href: '/catalog',
        icon: 'Compass',
        anyOf: ['course:read'],
      },
      {
        id: 'paths',
        label: 'Learning Paths',
        href: '/catalog/paths',
        icon: 'Route',
        anyOf: ['learning_path:read'],
        status: 'planned',
      },
      {
        id: 'recommended',
        label: 'Recommended Training',
        href: '/catalog/recommended',
        icon: 'Sparkles',
        anyOf: ['course:read'],
        status: 'planned',
      },
    ],
  },
  {
    id: 'learning',
    label: 'Learning',
    items: [
      {
        id: 'my-learning',
        label: 'My Learning',
        href: '/learning',
        icon: 'GraduationCap',
        anyOf: ['training_assignment:read_own'],
      },
      {
        id: 'my-courses',
        label: 'My Courses',
        href: '/learning/courses',
        icon: 'BookOpen',
        anyOf: ['enrollment:read'],
        status: 'planned',
      },
      {
        id: 'my-assignments',
        label: 'Assignments',
        href: '/learning/assignments',
        icon: 'ClipboardList',
        anyOf: ['assignment:read'],
        status: 'planned',
      },
      {
        id: 'my-quizzes',
        label: 'Quizzes & Exams',
        href: '/learning/quizzes',
        icon: 'FileQuestion',
        anyOf: ['quiz:read'],
        status: 'planned',
      },
      {
        id: 'calendar',
        label: 'Calendar',
        href: '/calendar',
        icon: 'Calendar',
        anyOf: ['organization:read'],
        status: 'planned',
      },
      {
        id: 'my-certificates',
        label: 'Certificates',
        href: '/learning/certificates',
        icon: 'Award',
        anyOf: ['certificate:read_own'],
        entitlement: 'CERTIFICATES',
        status: 'planned',
      },
    ],
  },
  {
    id: 'training',
    label: 'Training',
    items: [
      {
        id: 'training-catalog',
        label: 'Course Catalog',
        href: '/training/catalog',
        icon: 'Library',
        anyOf: ['course:read'],
        status: 'planned',
      },
      {
        id: 'required-training',
        label: 'Required Training',
        href: '/training/required',
        icon: 'ShieldCheck',
        anyOf: ['training_requirement:read'],
        status: 'planned',
      },
      {
        id: 'training-assignments',
        label: 'Training Assignments',
        href: '/training/assignments',
        icon: 'Send',
        anyOf: ['training_assignment:read'],
        status: 'planned',
      },
      {
        id: 'training-sessions',
        label: 'Training Sessions',
        href: '/training/sessions',
        icon: 'CalendarClock',
        anyOf: ['training_session:read'],
        status: 'planned',
      },
      {
        id: 'attendance',
        label: 'Attendance',
        href: '/training/attendance',
        icon: 'UserCheck',
        anyOf: ['attendance:read'],
        status: 'planned',
      },
      {
        id: 'training-matrix',
        label: 'Training Matrix',
        href: '/training/matrix',
        icon: 'Grid3x3',
        anyOf: ['training_matrix:read'],
        entitlement: 'TRAINING_MATRIX',
      },
      {
        id: 'certifications',
        label: 'Certifications',
        href: '/training/certificates',
        icon: 'BadgeCheck',
        anyOf: ['certificate:read'],
        entitlement: 'CERTIFICATES',
        status: 'planned',
      },
    ],
  },
  {
    id: 'safety',
    label: 'Safety',
    items: [
      {
        id: 'safety-command',
        label: 'Safety Command Center',
        href: '/safety',
        icon: 'ShieldAlert',
        anyOf: ['safety:read_dashboard'],
        entitlement: 'SAFETY_MODULE',
      },
      {
        id: 'safety-courses',
        label: 'Safety Courses',
        href: '/safety/courses',
        icon: 'HardHat',
        anyOf: ['course:read'],
        entitlement: 'SAFETY_MODULE',
        status: 'planned',
      },
      {
        id: 'safety-required',
        label: 'Required Safety Training',
        href: '/safety/required',
        icon: 'ListChecks',
        anyOf: ['training_requirement:read'],
        entitlement: 'SAFETY_MODULE',
        status: 'planned',
      },
      {
        id: 'safety-expiring',
        label: 'Expiring Training',
        href: '/safety/expiring',
        icon: 'Clock',
        anyOf: ['compliance:read'],
        entitlement: 'SAFETY_MODULE',
        badge: 'expiring',
        status: 'planned',
      },
      {
        id: 'safety-expired',
        label: 'Expired Training',
        href: '/safety/expired',
        icon: 'CircleAlert',
        anyOf: ['compliance:read'],
        entitlement: 'SAFETY_MODULE',
        badge: 'overdue',
        status: 'planned',
      },
      {
        id: 'safety-missing',
        label: 'Missing Training',
        href: '/safety/missing',
        icon: 'CircleSlash',
        anyOf: ['compliance:read'],
        entitlement: 'SAFETY_MODULE',
        status: 'planned',
      },
      {
        id: 'safety-matrix',
        label: 'Training Matrix',
        href: '/training/matrix',
        icon: 'Grid3x3',
        anyOf: ['training_matrix:read'],
        entitlement: 'TRAINING_MATRIX',
      },
      {
        id: 'practical',
        label: 'Practical Assessments',
        href: '/safety/practical',
        icon: 'ClipboardCheck',
        anyOf: ['practical_assessment:read'],
        entitlement: 'PRACTICAL_ASSESSMENTS',
        status: 'planned',
      },
      {
        id: 'incidents',
        label: 'Incidents',
        href: '/safety/incidents',
        icon: 'Siren',
        anyOf: ['incident:read'],
        entitlement: 'INCIDENT_MANAGEMENT',
        status: 'planned',
      },
      {
        id: 'corrective-actions',
        label: 'Corrective Actions',
        href: '/safety/corrective-actions',
        icon: 'Wrench',
        anyOf: ['corrective_action:read'],
        entitlement: 'INCIDENT_MANAGEMENT',
        status: 'planned',
      },
      {
        id: 'jha',
        label: 'JHA / JSA',
        href: '/safety/jha',
        icon: 'FileSearch',
        anyOf: ['jha:read'],
        entitlement: 'SAFETY_MODULE',
        status: 'planned',
      },
      {
        id: 'inspections',
        label: 'Inspections',
        href: '/safety/inspections',
        icon: 'ScanSearch',
        anyOf: ['observation:read'],
        entitlement: 'SAFETY_MODULE',
        status: 'planned',
      },
      {
        id: 'observations',
        label: 'Safety Observations',
        href: '/safety/observations',
        icon: 'Eye',
        anyOf: ['observation:read'],
        entitlement: 'SAFETY_MODULE',
        status: 'planned',
      },
    ],
  },
  {
    id: 'academics',
    label: 'Academics',
    items: [
      {
        id: 'courses',
        label: 'Courses',
        href: '/courses',
        icon: 'BookMarked',
        anyOf: ['course:update'],
        status: 'planned',
      },
      {
        id: 'modules',
        label: 'Modules',
        href: '/courses/modules',
        icon: 'Layers',
        anyOf: ['course:update'],
        status: 'planned',
      },
      {
        id: 'lessons',
        label: 'Lessons',
        href: '/courses/lessons',
        icon: 'FileText',
        anyOf: ['course:update'],
        status: 'planned',
      },
      {
        id: 'academic-assignments',
        label: 'Assignments',
        href: '/courses/assignments',
        icon: 'ClipboardList',
        anyOf: ['assignment:manage'],
        status: 'planned',
      },
      {
        id: 'gradebook',
        label: 'Gradebook',
        href: '/courses/gradebook',
        icon: 'Table',
        anyOf: ['grade:read'],
        status: 'planned',
      },
      {
        id: 'question-banks',
        label: 'Question Banks',
        href: '/content/question-banks',
        icon: 'Database',
        anyOf: ['question_bank:read'],
        status: 'planned',
      },
      {
        id: 'discussions',
        label: 'Discussions',
        href: '/courses/discussions',
        icon: 'MessagesSquare',
        anyOf: ['discussion:read'],
        status: 'planned',
      },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      {
        id: 'course-builder',
        label: 'Course Builder',
        href: '/content/builder',
        icon: 'Hammer',
        anyOf: ['course:create'],
        status: 'planned',
      },
      {
        id: 'content-banks',
        label: 'Question Banks',
        href: '/content/question-banks',
        icon: 'Database',
        anyOf: ['question_bank:manage'],
        status: 'planned',
      },
      {
        id: 'media',
        label: 'Media Library',
        href: '/content/media',
        icon: 'Image',
        anyOf: ['file:upload'],
        status: 'planned',
      },
      {
        id: 'documents',
        label: 'Documents',
        href: '/content/documents',
        icon: 'Files',
        anyOf: ['file:read'],
        status: 'planned',
      },
      {
        id: 'templates',
        label: 'Templates',
        href: '/content/templates',
        icon: 'LayoutTemplate',
        anyOf: ['course:create'],
        status: 'planned',
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      {
        id: 'employees',
        label: 'Employees',
        href: '/people/employees',
        icon: 'Users',
        anyOf: ['employee:read', 'employee:read_team'],
      },
      {
        id: 'students',
        label: 'Students',
        href: '/people/students',
        icon: 'UserRound',
        anyOf: ['employee:read'],
        status: 'planned',
      },
      {
        id: 'departments',
        label: 'Departments',
        href: '/people/departments',
        icon: 'Building2',
        anyOf: ['department:read'],
        status: 'planned',
      },
      {
        id: 'locations',
        label: 'Locations',
        href: '/people/locations',
        icon: 'MapPin',
        anyOf: ['location:read'],
        status: 'planned',
      },
      {
        id: 'job-roles',
        label: 'Job Roles',
        href: '/people/job-roles',
        icon: 'Briefcase',
        anyOf: ['job_role:read'],
        status: 'planned',
      },
      {
        id: 'training-profiles',
        label: 'Training Profiles',
        href: '/people/training-profiles',
        icon: 'IdCard',
        anyOf: ['employee:read'],
        status: 'planned',
      },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    items: [
      {
        id: 'compliance-dashboard',
        label: 'Compliance Dashboard',
        href: '/compliance',
        icon: 'Gauge',
        anyOf: ['compliance:read', 'compliance:read_team'],
      },
      {
        id: 'requirements',
        label: 'Training Requirements',
        href: '/compliance/requirements',
        icon: 'ListTodo',
        anyOf: ['training_requirement:read'],
        status: 'planned',
      },
      {
        id: 'compliance-missing',
        label: 'Missing Training',
        href: '/compliance/missing',
        icon: 'CircleSlash',
        anyOf: ['compliance:read'],
        status: 'planned',
      },
      {
        id: 'compliance-expiring',
        label: 'Expiring Training',
        href: '/compliance/expiring',
        icon: 'Clock',
        anyOf: ['compliance:read'],
        badge: 'expiring',
        status: 'planned',
      },
      {
        id: 'compliance-expired',
        label: 'Expired Training',
        href: '/compliance/expired',
        icon: 'CircleAlert',
        anyOf: ['compliance:read'],
        badge: 'overdue',
        status: 'planned',
      },
      {
        id: 'compliance-reports',
        label: 'Compliance Reports',
        href: '/reports/compliance',
        icon: 'FileBarChart',
        anyOf: ['report:run'],
        status: 'planned',
      },
      {
        id: 'audit-history',
        label: 'Audit History',
        href: '/compliance/audit',
        icon: 'History',
        anyOf: ['audit:read'],
        status: 'planned',
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    items: [
      {
        id: 'analytics-learning',
        label: 'Learning Analytics',
        href: '/analytics/learning',
        icon: 'LineChart',
        anyOf: ['analytics:learning'],
        status: 'planned',
      },
      {
        id: 'analytics-training',
        label: 'Training Analytics',
        href: '/analytics/training',
        icon: 'BarChart3',
        anyOf: ['analytics:training'],
        status: 'planned',
      },
      {
        id: 'analytics-safety',
        label: 'Safety Analytics',
        href: '/analytics/safety',
        icon: 'Activity',
        anyOf: ['analytics:safety'],
        entitlement: 'SAFETY_MODULE',
        status: 'planned',
      },
      {
        id: 'analytics-employee',
        label: 'Employee Analytics',
        href: '/analytics/employees',
        icon: 'UsersRound',
        anyOf: ['analytics:employee'],
        status: 'planned',
      },
      {
        id: 'analytics-organization',
        label: 'Organization Analytics',
        href: '/analytics/organization',
        icon: 'Building',
        anyOf: ['analytics:organization'],
        entitlement: 'ADVANCED_ANALYTICS',
        status: 'planned',
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    items: [
      {
        id: 'ai-tutor',
        label: 'AI Tutor',
        href: '/ai/tutor',
        icon: 'Bot',
        anyOf: ['ai:tutor'],
        entitlement: 'AI_TUTOR',
        status: 'planned',
      },
      {
        id: 'ai-course-builder',
        label: 'AI Course Builder',
        href: '/ai/course-builder',
        icon: 'Wand',
        anyOf: ['ai:course_builder'],
        entitlement: 'AI_COURSE_BUILDER',
        status: 'planned',
      },
      {
        id: 'ai-questions',
        label: 'AI Question Generator',
        href: '/ai/questions',
        icon: 'HelpCircle',
        anyOf: ['ai:question_generator'],
        entitlement: 'AI_QUESTION_GENERATOR',
        status: 'planned',
      },
      {
        id: 'ai-scenarios',
        label: 'AI Safety Scenario Builder',
        href: '/ai/scenarios',
        icon: 'Drama',
        anyOf: ['ai:scenario_generator'],
        entitlement: 'AI_SCENARIO_GENERATOR',
        status: 'planned',
      },
      {
        id: 'ai-study',
        label: 'AI Study Assistant',
        href: '/ai/study',
        icon: 'NotebookPen',
        anyOf: ['ai:tutor'],
        entitlement: 'AI_TUTOR',
        status: 'planned',
      },
      {
        id: 'ai-analytics',
        label: 'AI Analytics Assistant',
        href: '/ai/analytics',
        icon: 'Brain',
        anyOf: ['ai:analytics_assistant'],
        entitlement: 'AI_ANALYTICS_ASSISTANT',
        status: 'planned',
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      {
        id: 'reports-training',
        label: 'Training Reports',
        href: '/reports/training',
        icon: 'FileSpreadsheet',
        anyOf: ['report:run'],
        status: 'planned',
      },
      {
        id: 'reports-grades',
        label: 'Grade Reports',
        href: '/reports/grades',
        icon: 'FileText',
        anyOf: ['report:run', 'grade:read'],
        status: 'planned',
      },
      {
        id: 'reports-compliance',
        label: 'Compliance Reports',
        href: '/reports/compliance',
        icon: 'FileBarChart',
        anyOf: ['report:run'],
        status: 'planned',
      },
      {
        id: 'reports-certificates',
        label: 'Certificate Reports',
        href: '/reports/certificates',
        icon: 'FileCheck',
        anyOf: ['report:run'],
        entitlement: 'CERTIFICATES',
        status: 'planned',
      },
      {
        id: 'reports-audit',
        label: 'Audit Reports',
        href: '/reports/audit',
        icon: 'FileLock',
        anyOf: ['audit:read'],
        status: 'planned',
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        id: 'admin-organization',
        label: 'Organization',
        href: '/admin/organization',
        icon: 'Building2',
        anyOf: ['organization:update'],
        status: 'planned',
      },
      {
        id: 'admin-users',
        label: 'Users',
        href: '/admin/users',
        icon: 'Users',
        anyOf: ['user:read'],
        status: 'planned',
      },
      {
        id: 'admin-roles',
        label: 'Roles & Permissions',
        href: '/admin/roles',
        icon: 'KeyRound',
        anyOf: ['role:read'],
        status: 'planned',
      },
      {
        id: 'admin-billing',
        label: 'Billing',
        href: '/admin/billing',
        icon: 'CreditCard',
        anyOf: ['billing:read'],
        status: 'planned',
      },
      {
        id: 'admin-integrations',
        label: 'Integrations',
        href: '/admin/integrations',
        icon: 'Plug',
        anyOf: ['integration:read'],
        status: 'planned',
      },
      {
        id: 'admin-notifications',
        label: 'Notifications',
        href: '/admin/notifications',
        icon: 'Bell',
        anyOf: ['notification:manage'],
        status: 'planned',
      },
      {
        id: 'admin-security',
        label: 'Security',
        href: '/admin/security',
        icon: 'Lock',
        anyOf: ['security:manage'],
        status: 'planned',
      },
      {
        id: 'admin-settings',
        label: 'System Settings',
        href: '/admin/settings',
        icon: 'Settings',
        anyOf: ['organization:manage_settings'],
        status: 'planned',
      },
    ],
  },
];

export interface BuildNavigationOptions {
  /** Entitlement keys the tenant's plan grants. */
  readonly entitlements?: ReadonlySet<string> | readonly string[];
  /** Include items whose route is specified but not yet built. */
  readonly includePlanned?: boolean;
}

export interface ResolvedNavigationItem extends NavigationItem {
  readonly available: boolean;
}

export interface ResolvedNavigationSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly ResolvedNavigationItem[];
}

/**
 * Filters the tree for one user. An item survives when the user holds any of
 * its permissions AND the tenant's plan carries its entitlement. Sections with
 * no surviving items are dropped entirely.
 */
export const buildNavigation = (
  ctx: AccessContext,
  options: BuildNavigationOptions = {},
): ResolvedNavigationSection[] => {
  const entitlements =
    options.entitlements instanceof Set
      ? options.entitlements
      : new Set(options.entitlements ?? []);
  const includePlanned = options.includePlanned ?? true;

  const sections: ResolvedNavigationSection[] = [];

  for (const section of NAVIGATION) {
    const items: ResolvedNavigationItem[] = [];
    for (const item of section.items) {
      if (item.status === 'planned' && !includePlanned) continue;
      if (item.entitlement && !entitlements.has(item.entitlement)) continue;
      if (!item.anyOf.some((permission) => authorize(ctx, permission).allowed)) continue;
      items.push({ ...item, available: item.status !== 'planned' });
    }
    if (items.length > 0) sections.push({ id: section.id, label: section.label, items });
  }

  return sections;
};

/** Every href the tree can produce, used to check route coverage in tests. */
export const navigationHrefs = (): string[] => [
  ...new Set(NAVIGATION.flatMap((section) => section.items.map((item) => item.href))),
];
