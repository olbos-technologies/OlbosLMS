/**
 * The permission catalogue.
 *
 * Slugs are `resource:action`. Nothing in the product checks a role name to
 * decide access — code asks `can(ctx, 'training_record:create')`, so that a
 * custom role built by a customer works exactly like a built-in one.
 *
 * `scope: 'own'` permissions apply to the acting user's own data and are
 * evaluated against the resource's subject, never granted blindly.
 */

export const PERMISSION_GROUPS = [
  'organization',
  'people',
  'academics',
  'assessment',
  'training',
  'safety',
  'compliance',
  'analytics',
  'content',
  'ai',
  'administration',
  'platform',
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

interface PermissionDefinition {
  readonly slug: string;
  readonly group: PermissionGroup;
  readonly description: string;
}

const define = <T extends readonly PermissionDefinition[]>(defs: T): T => defs;

export const PERMISSION_DEFINITIONS = define([
  // --- organization -------------------------------------------------------
  { slug: 'organization:read', group: 'organization', description: 'View organization profile' },
  { slug: 'organization:update', group: 'organization', description: 'Edit organization profile' },
  {
    slug: 'organization:manage_settings',
    group: 'organization',
    description: 'Change organization settings',
  },
  {
    slug: 'organization:manage_branding',
    group: 'organization',
    description: 'Change logo, colours and certificate branding',
  },

  // --- people -------------------------------------------------------------
  { slug: 'user:read', group: 'people', description: 'View user accounts' },
  { slug: 'user:create', group: 'people', description: 'Invite and create users' },
  { slug: 'user:update', group: 'people', description: 'Edit user accounts' },
  { slug: 'user:deactivate', group: 'people', description: 'Suspend or deactivate users' },
  { slug: 'user:manage_roles', group: 'people', description: 'Grant and revoke roles' },
  { slug: 'role:read', group: 'people', description: 'View roles and permissions' },
  { slug: 'role:manage', group: 'people', description: 'Create and edit custom roles' },
  { slug: 'employee:read', group: 'people', description: 'View all employee records' },
  {
    slug: 'employee:read_team',
    group: 'people',
    description: 'View employees the user supervises',
  },
  { slug: 'employee:read_own', group: 'people', description: 'View own employee profile' },
  { slug: 'employee:create', group: 'people', description: 'Create employee records' },
  { slug: 'employee:update', group: 'people', description: 'Edit employee records' },
  { slug: 'employee:delete', group: 'people', description: 'Delete employee records' },
  { slug: 'department:read', group: 'people', description: 'View departments' },
  { slug: 'department:manage', group: 'people', description: 'Create and edit departments' },
  { slug: 'location:read', group: 'people', description: 'View locations' },
  { slug: 'location:manage', group: 'people', description: 'Create and edit locations' },
  { slug: 'job_role:read', group: 'people', description: 'View job roles' },
  { slug: 'job_role:manage', group: 'people', description: 'Create and edit job roles' },

  // --- academics ----------------------------------------------------------
  { slug: 'course:read', group: 'academics', description: 'View the course catalogue' },
  { slug: 'course:create', group: 'academics', description: 'Create courses' },
  { slug: 'course:update', group: 'academics', description: 'Edit course content' },
  { slug: 'course:publish', group: 'academics', description: 'Publish a course version' },
  { slug: 'course:archive', group: 'academics', description: 'Archive courses' },
  { slug: 'course:delete', group: 'academics', description: 'Delete draft courses' },
  { slug: 'enrollment:read', group: 'academics', description: 'View enrollments' },
  { slug: 'enrollment:manage', group: 'academics', description: 'Enroll and unenroll learners' },
  { slug: 'learning_path:read', group: 'academics', description: 'View learning paths' },
  {
    slug: 'learning_path:manage',
    group: 'academics',
    description: 'Create and edit learning paths',
  },
  { slug: 'discussion:read', group: 'academics', description: 'Read course discussions' },
  { slug: 'discussion:post', group: 'academics', description: 'Post to course discussions' },
  {
    slug: 'discussion:moderate',
    group: 'academics',
    description: 'Hide or lock discussion content',
  },
  { slug: 'announcement:create', group: 'academics', description: 'Publish announcements' },

  // --- assessment ---------------------------------------------------------
  { slug: 'question_bank:read', group: 'assessment', description: 'View question banks' },
  {
    slug: 'question_bank:manage',
    group: 'assessment',
    description: 'Create and edit question banks',
  },
  { slug: 'quiz:read', group: 'assessment', description: 'View quizzes and exams' },
  { slug: 'quiz:manage', group: 'assessment', description: 'Create and edit quizzes and exams' },
  { slug: 'quiz:attempt', group: 'assessment', description: 'Take a quiz or exam' },
  { slug: 'assignment:read', group: 'assessment', description: 'View assignments' },
  { slug: 'assignment:manage', group: 'assessment', description: 'Create and edit assignments' },
  { slug: 'submission:create', group: 'assessment', description: 'Submit assignment work' },
  { slug: 'submission:read', group: 'assessment', description: 'View learner submissions' },
  { slug: 'grade:read', group: 'assessment', description: 'View grades for all learners' },
  { slug: 'grade:read_own', group: 'assessment', description: 'View own grades' },
  { slug: 'grade:record', group: 'assessment', description: 'Enter and change grades' },
  { slug: 'grade:override', group: 'assessment', description: 'Override a calculated grade' },
  { slug: 'gradebook:manage', group: 'assessment', description: 'Configure gradebook weighting' },

  // --- training -----------------------------------------------------------
  {
    slug: 'training_requirement:read',
    group: 'training',
    description: 'View training requirements',
  },
  {
    slug: 'training_requirement:manage',
    group: 'training',
    description: 'Create and edit training requirements',
  },
  { slug: 'training_assignment:read', group: 'training', description: 'View training assignments' },
  {
    slug: 'training_assignment:read_own',
    group: 'training',
    description: 'View own training assignments',
  },
  { slug: 'training_assignment:create', group: 'training', description: 'Assign training' },
  {
    slug: 'training_assignment:waive',
    group: 'training',
    description: 'Waive a training assignment',
  },
  { slug: 'training_record:read', group: 'training', description: 'View all training records' },
  {
    slug: 'training_record:read_team',
    group: 'training',
    description: 'View training records for supervised employees',
  },
  { slug: 'training_record:read_own', group: 'training', description: 'View own training records' },
  { slug: 'training_record:create', group: 'training', description: 'Record completed training' },
  { slug: 'training_record:update', group: 'training', description: 'Correct a training record' },
  { slug: 'training_record:void', group: 'training', description: 'Void a training record' },
  { slug: 'training_session:read', group: 'training', description: 'View training sessions' },
  {
    slug: 'training_session:manage',
    group: 'training',
    description: 'Schedule and edit training sessions',
  },
  { slug: 'attendance:read', group: 'training', description: 'View attendance' },
  { slug: 'attendance:record', group: 'training', description: 'Record attendance' },
  { slug: 'certificate:read', group: 'training', description: 'View certificates' },
  { slug: 'certificate:read_own', group: 'training', description: 'View own certificates' },
  { slug: 'certificate:issue', group: 'training', description: 'Issue certificates' },
  { slug: 'certificate:revoke', group: 'training', description: 'Revoke certificates' },
  {
    slug: 'credential:manage',
    group: 'training',
    description: 'Issue and manage digital credentials',
  },

  // --- safety -------------------------------------------------------------
  { slug: 'safety:read_dashboard', group: 'safety', description: 'View the safety command centre' },
  { slug: 'practical_assessment:read', group: 'safety', description: 'View practical assessments' },
  {
    slug: 'practical_assessment:manage',
    group: 'safety',
    description: 'Create practical assessment templates',
  },
  {
    slug: 'practical_assessment:record',
    group: 'safety',
    description: 'Record and sign a practical assessment',
  },
  { slug: 'incident:read', group: 'safety', description: 'View incidents' },
  { slug: 'incident:create', group: 'safety', description: 'Report an incident' },
  { slug: 'incident:investigate', group: 'safety', description: 'Record investigation findings' },
  { slug: 'incident:close', group: 'safety', description: 'Close an incident' },
  { slug: 'corrective_action:read', group: 'safety', description: 'View corrective actions' },
  {
    slug: 'corrective_action:manage',
    group: 'safety',
    description: 'Create and close corrective actions',
  },
  { slug: 'jha:read', group: 'safety', description: 'View JHA/JSA documents' },
  { slug: 'jha:manage', group: 'safety', description: 'Create and edit JHA/JSA documents' },
  { slug: 'observation:read', group: 'safety', description: 'View safety observations' },
  { slug: 'observation:create', group: 'safety', description: 'Submit a safety observation' },
  {
    slug: 'observation:manage',
    group: 'safety',
    description: 'Triage and close safety observations',
  },
  { slug: 'scenario:read', group: 'safety', description: 'Run safety scenarios' },
  { slug: 'scenario:manage', group: 'safety', description: 'Create and publish safety scenarios' },

  // --- compliance ---------------------------------------------------------
  {
    slug: 'compliance:read',
    group: 'compliance',
    description: 'View organization-wide compliance',
  },
  {
    slug: 'compliance:read_team',
    group: 'compliance',
    description: 'View compliance for supervised employees',
  },
  { slug: 'training_matrix:read', group: 'compliance', description: 'View the training matrix' },
  { slug: 'audit:read', group: 'compliance', description: 'Read the audit history' },

  // --- analytics & reporting ---------------------------------------------
  { slug: 'analytics:learning', group: 'analytics', description: 'View learning analytics' },
  { slug: 'analytics:training', group: 'analytics', description: 'View training analytics' },
  { slug: 'analytics:safety', group: 'analytics', description: 'View safety analytics' },
  { slug: 'analytics:employee', group: 'analytics', description: 'View employee analytics' },
  {
    slug: 'analytics:organization',
    group: 'analytics',
    description: 'View organization analytics',
  },
  { slug: 'report:run', group: 'analytics', description: 'Run reports' },
  { slug: 'report:export', group: 'analytics', description: 'Export report data' },

  // --- content ------------------------------------------------------------
  { slug: 'file:read', group: 'content', description: 'Download files' },
  { slug: 'file:upload', group: 'content', description: 'Upload files' },
  { slug: 'file:delete', group: 'content', description: 'Delete files' },

  // --- AI -----------------------------------------------------------------
  { slug: 'ai:tutor', group: 'ai', description: 'Use the AI tutor' },
  { slug: 'ai:course_builder', group: 'ai', description: 'Use the AI course builder' },
  { slug: 'ai:question_generator', group: 'ai', description: 'Use the AI question generator' },
  {
    slug: 'ai:scenario_generator',
    group: 'ai',
    description: 'Use the AI safety scenario generator',
  },
  { slug: 'ai:analytics_assistant', group: 'ai', description: 'Use the AI analytics assistant' },
  { slug: 'ai:review', group: 'ai', description: 'Approve or reject AI-generated content' },

  // --- administration -----------------------------------------------------
  { slug: 'billing:read', group: 'administration', description: 'View subscription and invoices' },
  {
    slug: 'billing:manage',
    group: 'administration',
    description: 'Change plan and payment details',
  },
  { slug: 'integration:read', group: 'administration', description: 'View integrations' },
  { slug: 'integration:manage', group: 'administration', description: 'Configure integrations' },
  { slug: 'api_key:manage', group: 'administration', description: 'Create and revoke API keys' },
  {
    slug: 'notification:manage',
    group: 'administration',
    description: 'Configure organization notification policy',
  },
  {
    slug: 'security:manage',
    group: 'administration',
    description: 'Configure security policy (SSO, MFA, sessions)',
  },

  // --- platform (outside any tenant) --------------------------------------
  {
    slug: 'platform:manage_organizations',
    group: 'platform',
    description: 'Create and manage tenant organizations',
  },
  {
    slug: 'platform:manage_plans',
    group: 'platform',
    description: 'Manage plans and entitlements',
  },
  {
    slug: 'platform:manage_admins',
    group: 'platform',
    description: 'Manage platform staff accounts',
  },
  { slug: 'platform:analytics', group: 'platform', description: 'View platform-wide analytics' },
  {
    slug: 'platform:support',
    group: 'platform',
    description: 'Access an organization for support purposes',
  },
  {
    slug: 'platform:manage_templates',
    group: 'platform',
    description: 'Manage global course templates',
  },
] as const);

export type Permission = (typeof PERMISSION_DEFINITIONS)[number]['slug'];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_DEFINITIONS.map((p) => p.slug);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export const isPermission = (value: string): value is Permission => PERMISSION_SET.has(value);

/** Every permission a tenant role may hold (everything except `platform:*`). */
export const ORGANIZATION_PERMISSIONS: readonly Permission[] = PERMISSION_DEFINITIONS.filter(
  (p) => p.group !== 'platform',
).map((p) => p.slug);

export const PLATFORM_PERMISSIONS: readonly Permission[] = PERMISSION_DEFINITIONS.filter(
  (p) => p.group === 'platform',
).map((p) => p.slug);

/**
 * Permissions that only ever apply to the actor's own data. `can()` refuses to
 * satisfy a request about another subject with one of these.
 */
export const SELF_SCOPED_PERMISSIONS = new Set<Permission>([
  'employee:read_own',
  'grade:read_own',
  'training_assignment:read_own',
  'training_record:read_own',
  'certificate:read_own',
]);

/** Permissions limited to the people a supervisor is responsible for. */
export const TEAM_SCOPED_PERMISSIONS = new Set<Permission>([
  'employee:read_team',
  'training_record:read_team',
  'compliance:read_team',
]);
