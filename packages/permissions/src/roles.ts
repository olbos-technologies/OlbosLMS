import { ORGANIZATION_PERMISSIONS, PLATFORM_PERMISSIONS, type Permission } from './permissions.js';

/**
 * Built-in role templates. A tenant is seeded with one `Role` row per template;
 * customers may then edit the grants or add custom roles. Code never branches
 * on a role key — these lists exist only to produce permission sets.
 */

export const ROLE_KEYS = [
  'ORG_OWNER',
  'ORG_ADMINISTRATOR',
  'HR_ADMINISTRATOR',
  'EHS_ADMINISTRATOR',
  'INSTRUCTOR',
  'SAFETY_TRAINER',
  'TEACHING_ASSISTANT',
  'SUPERVISOR',
  'LEARNER',
  'CUSTOM',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const PLATFORM_ROLES = ['NONE', 'PLATFORM_ADMINISTRATOR', 'PLATFORM_OWNER'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Permissions every authenticated member of an organization holds. */
const LEARNER_BASELINE: Permission[] = [
  'organization:read',
  'course:read',
  'learning_path:read',
  'enrollment:read',
  'quiz:read',
  'quiz:attempt',
  'assignment:read',
  'submission:create',
  'grade:read_own',
  'discussion:read',
  'discussion:post',
  'training_assignment:read_own',
  'training_record:read_own',
  'certificate:read_own',
  'training_session:read',
  'employee:read_own',
  'observation:create',
  'scenario:read',
  'file:read',
  'file:upload',
];

const TEACHING_ASSISTANT: Permission[] = [
  ...LEARNER_BASELINE,
  'enrollment:read',
  'submission:read',
  'grade:read',
  'grade:record',
  'discussion:moderate',
  'attendance:read',
  'analytics:learning',
];

const INSTRUCTOR: Permission[] = [
  ...TEACHING_ASSISTANT,
  'course:create',
  'course:update',
  'course:publish',
  'course:archive',
  'enrollment:manage',
  'learning_path:manage',
  'question_bank:read',
  'question_bank:manage',
  'quiz:manage',
  'assignment:manage',
  'grade:override',
  'gradebook:manage',
  'announcement:create',
  'training_session:read',
  'training_session:manage',
  'attendance:record',
  'analytics:training',
  'report:run',
  'ai:tutor',
  'ai:course_builder',
  'ai:question_generator',
  'ai:review',
];

const SAFETY_TRAINER: Permission[] = [
  ...LEARNER_BASELINE,
  'employee:read',
  'course:create',
  'course:update',
  'course:publish',
  'question_bank:read',
  'question_bank:manage',
  'quiz:manage',
  'enrollment:manage',
  'training_assignment:read',
  'training_assignment:create',
  'training_record:read',
  'training_record:create',
  'training_session:read',
  'training_session:manage',
  'attendance:read',
  'attendance:record',
  'certificate:read',
  'certificate:issue',
  'practical_assessment:read',
  'practical_assessment:record',
  'safety:read_dashboard',
  'scenario:read',
  'analytics:safety',
  'analytics:training',
  'report:run',
  'ai:tutor',
  'ai:question_generator',
  'ai:scenario_generator',
  'ai:review',
];

const SUPERVISOR: Permission[] = [
  ...LEARNER_BASELINE,
  'employee:read_team',
  'training_assignment:read',
  'training_assignment:create',
  'training_record:read_team',
  'compliance:read_team',
  'training_matrix:read',
  'attendance:read',
  'certificate:read',
  'observation:read',
  'incident:create',
  'analytics:employee',
  'report:run',
];

const HR_ADMINISTRATOR: Permission[] = [
  ...LEARNER_BASELINE,
  'user:read',
  'user:create',
  'user:update',
  'user:deactivate',
  'employee:read',
  'employee:create',
  'employee:update',
  'employee:delete',
  'department:read',
  'department:manage',
  'location:read',
  'location:manage',
  'job_role:read',
  'job_role:manage',
  'training_requirement:read',
  'training_requirement:manage',
  'training_assignment:read',
  'training_assignment:create',
  'training_assignment:waive',
  'training_record:read',
  'training_record:create',
  'training_record:update',
  'training_session:read',
  'attendance:read',
  'certificate:read',
  'compliance:read',
  'training_matrix:read',
  'analytics:employee',
  'analytics:training',
  'analytics:organization',
  'report:run',
  'report:export',
  'audit:read',
];

const EHS_ADMINISTRATOR: Permission[] = [
  ...LEARNER_BASELINE,
  'employee:read',
  'department:read',
  'location:read',
  'job_role:read',
  'course:create',
  'course:update',
  'course:publish',
  'course:archive',
  'question_bank:read',
  'question_bank:manage',
  'quiz:manage',
  'enrollment:manage',
  'training_requirement:read',
  'training_requirement:manage',
  'training_assignment:read',
  'training_assignment:create',
  'training_assignment:waive',
  'training_record:read',
  'training_record:create',
  'training_record:update',
  'training_record:void',
  'training_session:read',
  'training_session:manage',
  'attendance:read',
  'attendance:record',
  'certificate:read',
  'certificate:issue',
  'certificate:revoke',
  'credential:manage',
  'safety:read_dashboard',
  'practical_assessment:read',
  'practical_assessment:manage',
  'practical_assessment:record',
  'incident:read',
  'incident:create',
  'incident:investigate',
  'incident:close',
  'corrective_action:read',
  'corrective_action:manage',
  'jha:read',
  'jha:manage',
  'observation:read',
  'observation:manage',
  'scenario:read',
  'scenario:manage',
  'compliance:read',
  'training_matrix:read',
  'audit:read',
  'analytics:safety',
  'analytics:training',
  'analytics:employee',
  'analytics:organization',
  'report:run',
  'report:export',
  'ai:tutor',
  'ai:question_generator',
  'ai:scenario_generator',
  'ai:analytics_assistant',
  'ai:review',
];

const ORG_ADMINISTRATOR: Permission[] = ORGANIZATION_PERMISSIONS.filter(
  (p) => p !== 'billing:manage',
);

const ORG_OWNER: Permission[] = [...ORGANIZATION_PERMISSIONS];

const dedupe = (permissions: Permission[]): Permission[] => [...new Set(permissions)].sort();

export interface RoleTemplate {
  readonly key: RoleKey;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly Permission[];
}

export const ROLE_TEMPLATES: Readonly<Record<Exclude<RoleKey, 'CUSTOM'>, RoleTemplate>> = {
  ORG_OWNER: {
    key: 'ORG_OWNER',
    name: 'Organization Owner',
    description: 'Full access to everything in the organization, including billing.',
    permissions: dedupe(ORG_OWNER),
  },
  ORG_ADMINISTRATOR: {
    key: 'ORG_ADMINISTRATOR',
    name: 'Organization Administrator',
    description: 'Manages users, structure, courses, training, reports and settings.',
    permissions: dedupe(ORG_ADMINISTRATOR),
  },
  HR_ADMINISTRATOR: {
    key: 'HR_ADMINISTRATOR',
    name: 'HR Administrator',
    description: 'Manages employees, job roles, training profiles and compliance reporting.',
    permissions: dedupe(HR_ADMINISTRATOR),
  },
  EHS_ADMINISTRATOR: {
    key: 'EHS_ADMINISTRATOR',
    name: 'EHS / Safety Administrator',
    description: 'Owns safety training, the training matrix, incidents and safety compliance.',
    permissions: dedupe(EHS_ADMINISTRATOR),
  },
  INSTRUCTOR: {
    key: 'INSTRUCTOR',
    name: 'Professor / Instructor',
    description: 'Builds and delivers courses, assesses learners and maintains the gradebook.',
    permissions: dedupe(INSTRUCTOR),
  },
  SAFETY_TRAINER: {
    key: 'SAFETY_TRAINER',
    name: 'Safety Trainer',
    description: 'Delivers safety training, records attendance, assessments and certificates.',
    permissions: dedupe(SAFETY_TRAINER),
  },
  TEACHING_ASSISTANT: {
    key: 'TEACHING_ASSISTANT',
    name: 'Teaching Assistant',
    description: 'Supports an instructor: grading, discussion moderation, attendance visibility.',
    permissions: dedupe(TEACHING_ASSISTANT),
  },
  SUPERVISOR: {
    key: 'SUPERVISOR',
    name: 'Supervisor / Manager',
    description: 'Monitors and assigns training for the employees they supervise.',
    permissions: dedupe(SUPERVISOR),
  },
  LEARNER: {
    key: 'LEARNER',
    name: 'Student / Employee',
    description: 'Completes assigned learning and training, and views their own records.',
    permissions: dedupe(LEARNER_BASELINE),
  },
};

export const PLATFORM_ROLE_PERMISSIONS: Readonly<Record<PlatformRole, readonly Permission[]>> = {
  NONE: [],
  PLATFORM_ADMINISTRATOR: ['platform:support', 'platform:analytics', 'platform:manage_templates'],
  PLATFORM_OWNER: [...PLATFORM_PERMISSIONS],
};
