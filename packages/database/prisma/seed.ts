import { randomUUID } from 'node:crypto';
import { hashPassword } from '@olbos/auth';
import { PLAN_CATALOGUE } from '@olbos/billing';
import {
  addDays,
  certificateIntegrityHash,
  computeComplianceState,
  computeExpiresAt,
  disclaimerFor,
  formatCertificateNumber,
  generatePublicId,
} from '@olbos/core';
import { ROLE_TEMPLATES } from '@olbos/permissions';
import {
  forTenant,
  getPrismaClient,
  purgeOrganizationsBySlug,
  type PrismaClient,
} from '../src/index.js';

/**
 * Development seed.
 *
 * Produces a dataset that exercises the whole product: two tenants on different
 * plans, a manufacturer with a real safety-compliance position (current,
 * expiring, expired and missing training) and a college with an academic
 * gradebook. It is deliberately not uniform — a demo where everybody is
 * compliant shows none of the software that matters.
 *
 * Safe to re-run: it clears the two demo tenants first and leaves any other
 * organization alone.
 */

const NOW = new Date();
const DEMO_PASSWORD = 'olbos-demo-passphrase';
const CERT_SECRET = process.env.CERTIFICATE_SIGNING_SECRET ?? 'seed-only-certificate-secret-000000';

const daysAgo = (days: number): Date => addDays(NOW, -days);
const daysAhead = (days: number): Date => addDays(NOW, days);

let certificateSequence = 0;

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

const seedPlans = async (prisma: PrismaClient): Promise<Map<string, string>> => {
  const ids = new Map<string, string>();

  for (const definition of PLAN_CATALOGUE) {
    const plan = await prisma.plan.upsert({
      where: { key: definition.key },
      update: {
        name: definition.name,
        tier: definition.tier,
        description: definition.description,
        priceCents: definition.priceCents,
        currency: definition.currency,
        interval: definition.interval,
        isPublic: definition.isPublic,
        sortOrder: definition.sortOrder,
      },
      create: {
        key: definition.key,
        name: definition.name,
        tier: definition.tier,
        description: definition.description,
        priceCents: definition.priceCents,
        currency: definition.currency,
        interval: definition.interval,
        isPublic: definition.isPublic,
        sortOrder: definition.sortOrder,
      },
    });

    await prisma.planEntitlement.deleteMany({ where: { planId: plan.id } });
    await prisma.planEntitlement.createMany({
      data: definition.entitlements.map((grant) => ({
        planId: plan.id,
        key: grant.key,
        valueType: grant.valueType,
        boolValue: grant.boolValue ?? null,
        numValue: grant.numValue ?? null,
      })),
    });

    ids.set(definition.key, plan.id);
  }

  console.log(`  plans: ${ids.size}`);
  return ids;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const seedRoles = async (tenant: ReturnType<typeof forTenant>): Promise<Map<string, string>> => {
  const ids = new Map<string, string>();
  for (const template of Object.values(ROLE_TEMPLATES)) {
    const role = await tenant.role.create({
      data: {
        key: template.key,
        name: template.name,
        description: template.description,
        isSystem: true,
        permissions: [...template.permissions],
      },
    });
    ids.set(template.key, role.id);
  }
  return ids;
};

interface UserSpec {
  email: string;
  firstName: string;
  lastName: string;
  role: keyof typeof ROLE_TEMPLATES;
}

const createUser = async (
  tenant: ReturnType<typeof forTenant>,
  roleIds: Map<string, string>,
  spec: UserSpec,
  passwordHash: string,
): Promise<{ id: string }> => {
  const user = await tenant.user.create({
    data: {
      email: spec.email,
      emailNormalized: spec.email.toLowerCase(),
      emailVerifiedAt: NOW,
      passwordHash,
      passwordUpdatedAt: NOW,
      firstName: spec.firstName,
      lastName: spec.lastName,
      status: 'ACTIVE',
      lastLoginAt: daysAgo(1),
    },
  });

  await tenant.userRole.create({
    data: {
      userId: user.id,
      roleId: roleIds.get(spec.role) as string,
      scopeType: 'ORGANIZATION',
      grantedAt: NOW,
    },
  });

  return user;
};

// ---------------------------------------------------------------------------
// Tenant 1 — Acme Manufacturing (safety and compliance)
// ---------------------------------------------------------------------------

interface SafetyCourseSpec {
  slug: string;
  title: string;
  summary: string;
  safetyCategory: string;
  hazardCategories: string[];
  renewalIntervalDays: number | null;
  estimatedMinutes: number;
  regulatoryReferences: string[];
  requiresPractical?: boolean;
  deliveryMethod?: 'ONLINE_SELF_PACED' | 'BLENDED' | 'INSTRUCTOR_LED_CLASSROOM';
}

const SAFETY_COURSES: SafetyCourseSpec[] = [
  {
    slug: 'hazard-communication',
    title: 'Hazard Communication',
    summary: 'Chemical hazards, labels, safety data sheets and your right to know.',
    safetyCategory: 'Hazard Communication',
    hazardCategories: ['chemical'],
    renewalIntervalDays: 365,
    estimatedMinutes: 60,
    regulatoryReferences: ['29 CFR 1910.1200'],
  },
  {
    slug: 'lockout-tagout',
    title: 'Lockout/Tagout',
    summary: 'Control of hazardous energy during servicing and maintenance.',
    safetyCategory: 'Control of Hazardous Energy',
    hazardCategories: ['hazardous-energy', 'electrical', 'mechanical'],
    renewalIntervalDays: 365,
    estimatedMinutes: 120,
    regulatoryReferences: ['29 CFR 1910.147'],
    requiresPractical: true,
    deliveryMethod: 'BLENDED',
  },
  {
    slug: 'personal-protective-equipment',
    title: 'Personal Protective Equipment',
    summary: 'Selecting, fitting, inspecting and maintaining PPE.',
    safetyCategory: 'PPE',
    hazardCategories: ['general'],
    renewalIntervalDays: 730,
    estimatedMinutes: 45,
    regulatoryReferences: ['29 CFR 1910.132'],
  },
  {
    slug: 'forklift-safety',
    title: 'Forklift Safety',
    summary: 'Powered industrial truck operation, inspection and load handling.',
    safetyCategory: 'Powered Industrial Trucks',
    hazardCategories: ['vehicle', 'struck-by'],
    renewalIntervalDays: 1095,
    estimatedMinutes: 180,
    regulatoryReferences: ['29 CFR 1910.178'],
    requiresPractical: true,
    deliveryMethod: 'BLENDED',
  },
  {
    slug: 'fall-protection',
    title: 'Fall Protection',
    summary: 'Working at height, harness inspection and anchorage.',
    safetyCategory: 'Fall Protection',
    hazardCategories: ['fall', 'height'],
    renewalIntervalDays: 730,
    estimatedMinutes: 90,
    regulatoryReferences: ['29 CFR 1910.28'],
  },
  {
    slug: 'confined-space-entry',
    title: 'Confined Space Entry',
    summary: 'Permit-required confined spaces, atmospheric testing and rescue.',
    safetyCategory: 'Confined Space',
    hazardCategories: ['confined-space', 'atmospheric'],
    renewalIntervalDays: 365,
    estimatedMinutes: 150,
    regulatoryReferences: ['29 CFR 1910.146'],
    requiresPractical: true,
    deliveryMethod: 'BLENDED',
  },
  {
    slug: 'machine-guarding',
    title: 'Machine Guarding',
    summary: 'Point-of-operation guarding and safeguarding devices.',
    safetyCategory: 'Machine Safety',
    hazardCategories: ['mechanical', 'caught-in'],
    renewalIntervalDays: 730,
    estimatedMinutes: 60,
    regulatoryReferences: ['29 CFR 1910.212'],
  },
  {
    slug: 'electrical-safety',
    title: 'Electrical Safety',
    summary: 'Approach boundaries, arc flash awareness and safe work practices.',
    safetyCategory: 'Electrical Safety',
    hazardCategories: ['electrical', 'arc-flash'],
    renewalIntervalDays: 1095,
    estimatedMinutes: 120,
    regulatoryReferences: ['29 CFR 1910.331-335', 'NFPA 70E'],
  },
  {
    slug: 'emergency-response',
    title: 'Emergency Response and Evacuation',
    summary: 'Alarms, evacuation routes, assembly points and roles.',
    safetyCategory: 'Emergency Response',
    hazardCategories: ['emergency', 'fire'],
    renewalIntervalDays: 365,
    estimatedMinutes: 45,
    regulatoryReferences: ['29 CFR 1910.38'],
  },
  {
    slug: 'first-aid-cpr',
    title: 'First Aid and CPR',
    summary: 'Basic life support, bleeding control and AED use.',
    safetyCategory: 'First Aid',
    hazardCategories: ['medical'],
    renewalIntervalDays: 730,
    estimatedMinutes: 240,
    regulatoryReferences: ['29 CFR 1910.151'],
    deliveryMethod: 'INSTRUCTOR_LED_CLASSROOM',
  },
];

const LOTO_CRITERIA = [
  { text: 'Identifies all energy sources for the equipment', isCritical: true },
  { text: 'Notifies affected employees before beginning', isCritical: false },
  { text: 'Shuts down equipment using the normal stopping procedure', isCritical: false },
  { text: 'Applies personal lock and tag to each isolation point', isCritical: true },
  { text: 'Verifies zero energy state before starting work', isCritical: true },
  { text: 'Performs the work using safe practices', isCritical: false },
  { text: 'Restores equipment and removes locks in the correct order', isCritical: true },
];

interface EmployeeSpec {
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department: string;
  location: string;
  jobRole: string;
  shift: 'Day' | 'Night';
  equipment: string[];
  hazards: string[];
  hireYearsAgo: number;
  supervisor?: string;
  /** Training the seed marks complete, with how long ago (days). */
  completed: Record<string, number>;
  /**
   * Training assigned long ago and never completed, so the demo shows genuinely
   * overdue (MISSING) cells rather than only pending ones.
   */
  overdue?: string[];
}

const ACME_EMPLOYEES: EmployeeSpec[] = [
  {
    firstName: 'John',
    lastName: 'Smith',
    employeeNumber: 'E-1001',
    department: 'Maintenance',
    location: 'Plant 1 - Toledo',
    jobRole: 'Maintenance Technician',
    shift: 'Day',
    equipment: ['forklift'],
    hazards: ['confined-space'],
    hireYearsAgo: 4,
    supervisor: 'E-1000',
    // PPE is deliberately near expiry and forklift is overdue and missing.
    overdue: ['forklift-safety'],
    completed: {
      'hazard-communication': 40,
      'lockout-tagout': 90,
      'personal-protective-equipment': 715,
      'electrical-safety': 200,
      'machine-guarding': 300,
    },
  },
  {
    firstName: 'Jane',
    lastName: 'Doe',
    employeeNumber: 'E-1002',
    department: 'Maintenance',
    location: 'Plant 1 - Toledo',
    jobRole: 'Maintenance Technician',
    shift: 'Day',
    equipment: ['forklift'],
    hazards: ['confined-space'],
    hireYearsAgo: 6,
    supervisor: 'E-1000',
    completed: {
      'hazard-communication': 20,
      'lockout-tagout': 30,
      'personal-protective-equipment': 100,
      'electrical-safety': 120,
      'machine-guarding': 60,
      'forklift-safety': 200,
      'confined-space-entry': 45,
      'emergency-response': 30,
      'first-aid-cpr': 180,
      'fall-protection': 90,
    },
  },
  {
    firstName: 'Amir',
    lastName: 'Haddad',
    employeeNumber: 'E-1003',
    department: 'Production',
    location: 'Plant 1 - Toledo',
    jobRole: 'Machine Operator',
    shift: 'Night',
    equipment: [],
    hazards: [],
    hireYearsAgo: 2,
    supervisor: 'E-1000',
    // Hazard Communication has lapsed, and emergency response was never done.
    overdue: ['emergency-response'],
    completed: { 'hazard-communication': 400, 'machine-guarding': 100 },
  },
  {
    firstName: 'Priya',
    lastName: 'Raman',
    employeeNumber: 'E-1004',
    department: 'Warehouse',
    location: 'Plant 1 - Toledo',
    jobRole: 'Forklift Operator',
    shift: 'Day',
    equipment: ['forklift', 'aerial-lift'],
    hazards: [],
    hireYearsAgo: 3,
    supervisor: 'E-1005',
    overdue: ['personal-protective-equipment'],
    completed: {
      'hazard-communication': 15,
      'personal-protective-equipment': 200,
      'forklift-safety': 1050,
      'emergency-response': 60,
    },
  },
  {
    firstName: 'Marcus',
    lastName: 'Webb',
    employeeNumber: 'E-1005',
    department: 'Warehouse',
    location: 'Plant 1 - Toledo',
    jobRole: 'Warehouse Supervisor',
    shift: 'Day',
    equipment: ['forklift'],
    hazards: [],
    hireYearsAgo: 8,
    completed: {
      'hazard-communication': 10,
      'personal-protective-equipment': 50,
      'forklift-safety': 300,
      'emergency-response': 20,
      'first-aid-cpr': 400,
    },
  },
  {
    firstName: 'Elena',
    lastName: 'Kowalski',
    employeeNumber: 'E-1006',
    department: 'EHS',
    location: 'Plant 1 - Toledo',
    jobRole: 'EHS Specialist',
    shift: 'Day',
    equipment: [],
    hazards: ['confined-space'],
    hireYearsAgo: 5,
    completed: {
      'hazard-communication': 5,
      'lockout-tagout': 20,
      'personal-protective-equipment': 30,
      'confined-space-entry': 40,
      'emergency-response': 10,
      'first-aid-cpr': 60,
      'fall-protection': 50,
      'electrical-safety': 100,
      'machine-guarding': 80,
    },
  },
  {
    firstName: 'Tom',
    lastName: 'Nguyen',
    employeeNumber: 'E-1007',
    department: 'Production',
    location: 'Plant 2 - Dayton',
    jobRole: 'Machine Operator',
    shift: 'Night',
    equipment: [],
    hazards: [],
    hireYearsAgo: 1,
    supervisor: 'E-1000',
    overdue: ['machine-guarding', 'emergency-response'],
    completed: { 'hazard-communication': 300 },
  },
  {
    firstName: 'Sofia',
    lastName: 'Marino',
    employeeNumber: 'E-1008',
    department: 'Production',
    location: 'Plant 2 - Dayton',
    jobRole: 'Machine Operator',
    shift: 'Day',
    equipment: [],
    hazards: [],
    hireYearsAgo: 0,
    supervisor: 'E-1000',
    // A brand-new starter: everything is still pending.
    completed: {},
  },
  {
    firstName: 'David',
    lastName: 'Okonkwo',
    employeeNumber: 'E-1009',
    department: 'Maintenance',
    location: 'Plant 2 - Dayton',
    jobRole: 'Maintenance Technician',
    shift: 'Night',
    equipment: [],
    hazards: ['confined-space'],
    hireYearsAgo: 7,
    supervisor: 'E-1000',
    completed: {
      'hazard-communication': 25,
      'lockout-tagout': 370,
      'personal-protective-equipment': 60,
      'electrical-safety': 500,
      'machine-guarding': 40,
      'confined-space-entry': 380,
    },
  },
  {
    firstName: 'Hannah',
    lastName: 'Berg',
    employeeNumber: 'E-1010',
    department: 'Office',
    location: 'Head Office - Columbus',
    jobRole: 'Office Administrator',
    shift: 'Day',
    equipment: [],
    hazards: [],
    hireYearsAgo: 3,
    completed: { 'hazard-communication': 30, 'emergency-response': 45 },
  },
];

const seedAcme = async (prisma: PrismaClient, planIds: Map<string, string>): Promise<void> => {
  const org = await prisma.organization.create({
    data: {
      slug: 'acme-manufacturing',
      name: 'Acme Manufacturing',
      legalName: 'Acme Manufacturing Co.',
      type: 'MANUFACTURING',
      status: 'ACTIVE',
      timezone: 'America/New_York',
      primaryDomain: 'acme.test',
      brandColor: '#0f4c81',
      settings: {
        warningIntervalDays: [90, 60, 30, 14, 7, 1],
        certificateDisclaimer:
          'Questions about this record? Contact the Acme EHS team at ehs@acme.test.',
      },
    },
  });

  const tenant = forTenant(org.id, prisma);

  await prisma.subscription.create({
    data: {
      organizationId: org.id,
      planId: planIds.get('professional') as string,
      status: 'ACTIVE',
      currentPeriodStart: daysAgo(10),
      currentPeriodEnd: daysAhead(20),
      seatsPurchased: 100,
    },
  });

  const roleIds = await seedRoles(tenant);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // --- Structure ----------------------------------------------------------
  const locations = new Map<string, string>();
  for (const spec of [
    { name: 'Plant 1 - Toledo', city: 'Toledo', region: 'OH' },
    { name: 'Plant 2 - Dayton', city: 'Dayton', region: 'OH' },
    { name: 'Head Office - Columbus', city: 'Columbus', region: 'OH' },
  ]) {
    const location = await tenant.location.create({
      data: {
        name: spec.name,
        city: spec.city,
        region: spec.region,
        country: 'US',
        timezone: 'America/New_York',
      },
    });
    locations.set(spec.name, location.id);
  }

  const departments = new Map<string, string>();
  for (const name of ['Maintenance', 'Production', 'Warehouse', 'EHS', 'Office']) {
    const department = await tenant.department.create({ data: { name } });
    departments.set(name, department.id);
  }

  const jobRoles = new Map<string, string>();
  for (const spec of [
    { title: 'Maintenance Technician', hazards: ['hazardous-energy', 'electrical', 'mechanical'] },
    { title: 'Machine Operator', hazards: ['mechanical', 'chemical'] },
    { title: 'Forklift Operator', hazards: ['vehicle'] },
    { title: 'Warehouse Supervisor', hazards: ['vehicle'] },
    { title: 'EHS Specialist', hazards: ['chemical', 'confined-space'] },
    { title: 'Office Administrator', hazards: [] },
  ]) {
    const jobRole = await tenant.jobRole.create({
      data: { title: spec.title, hazardExposures: spec.hazards },
    });
    jobRoles.set(spec.title, jobRole.id);
  }

  // --- Staff accounts -----------------------------------------------------
  const staff = [
    {
      email: 'owner@acme.test',
      firstName: 'Rachel',
      lastName: 'Torres',
      role: 'ORG_OWNER' as const,
    },
    {
      email: 'ehs@acme.test',
      firstName: 'Elena',
      lastName: 'Kowalski',
      role: 'EHS_ADMINISTRATOR' as const,
    },
    {
      email: 'hr@acme.test',
      firstName: 'Daniel',
      lastName: 'Frost',
      role: 'HR_ADMINISTRATOR' as const,
    },
    {
      email: 'supervisor@acme.test',
      firstName: 'Marcus',
      lastName: 'Webb',
      role: 'SUPERVISOR' as const,
    },
    {
      email: 'trainer@acme.test',
      firstName: 'Dana',
      lastName: 'Ruiz',
      role: 'SAFETY_TRAINER' as const,
    },
    { email: 'learner@acme.test', firstName: 'John', lastName: 'Smith', role: 'LEARNER' as const },
  ];

  const users = new Map<string, string>();
  for (const spec of staff) {
    const user = await createUser(tenant, roleIds, spec, passwordHash);
    users.set(spec.email, user.id);
  }

  // --- Courses ------------------------------------------------------------
  const courses = new Map<
    string,
    { courseId: string; versionId: string; renewal: number | null }
  >();

  for (const spec of SAFETY_COURSES) {
    const course = await tenant.course.create({
      data: {
        title: spec.title,
        slug: spec.slug,
        summary: spec.summary,
        type: 'SAFETY',
        status: 'PUBLISHED',
        ownerId: users.get('ehs@acme.test') as string,
        tags: spec.hazardCategories,
        versions: {
          create: {
            version: 1,
            title: spec.title,
            description: spec.summary,
            objectives: [
              `Recognise the hazards addressed by ${spec.title.toLowerCase()}`,
              'Apply the required controls correctly',
              'Know when to stop work and escalate',
            ],
            deliveryMethod: spec.deliveryMethod ?? 'ONLINE_SELF_PACED',
            trainingType: 'SAFETY_AWARENESS_TRAINING',
            estimatedMinutes: spec.estimatedMinutes,
            creditHours: spec.estimatedMinutes / 60,
            passingScore: 80,
            maxAttempts: 3,
            requiresFinalAssessment: true,
            requiresPracticalAssessment: spec.requiresPractical ?? false,
            renewalIntervalDays: spec.renewalIntervalDays,
            expirationBasis: 'COMPLETION_DATE',
            warningIntervalDays: [90, 60, 30, 14, 7, 1],
            issuesCertificate: true,
            effectiveDate: daysAgo(400),
            reviewDate: daysAhead(330),
            publishedAt: daysAgo(400),
            publishedById: users.get('ehs@acme.test') as string,
            safetyProfile: {
              create: {
                safetyCategory: spec.safetyCategory,
                industry: 'Manufacturing',
                hazardCategories: spec.hazardCategories,
                targetAudience: ['All affected employees'],
                regulatoryReferences: spec.regulatoryReferences,
                companyPolicyReferences: [`ACME-EHS-${spec.slug.toUpperCase()}`],
                instructorRequirements: spec.requiresPractical
                  ? 'Qualified person designated by the EHS Manager'
                  : null,
                disclaimer: disclaimerFor(
                  'SAFETY_AWARENESS_TRAINING',
                  'Questions? Contact the Acme EHS team at ehs@acme.test.',
                ),
                revision: 'Rev 1.0',
              },
            },
            modules: {
              create: [
                {
                  title: 'Why this matters',
                  position: 1,
                  lessons: {
                    create: [
                      {
                        title: 'Hazards and consequences',
                        position: 1,
                        contentType: 'RICH_TEXT',
                        body: `<p>${spec.summary}</p><p>This module explains the hazards involved and what can go wrong when controls are not applied.</p>`,
                        durationSeconds: 480,
                        minimumSeconds: 240,
                      },
                      {
                        title: 'Incident case study',
                        position: 2,
                        contentType: 'RICH_TEXT',
                        body: '<p>A short case study drawn from industry incident reports, with the sequence of decisions that led to the outcome.</p>',
                        durationSeconds: 360,
                      },
                    ],
                  },
                },
                {
                  title: 'Controls and procedures',
                  position: 2,
                  lessons: {
                    create: [
                      {
                        title: 'Required controls',
                        position: 1,
                        contentType: 'RICH_TEXT',
                        body: '<p>The controls this organization requires, in the order they are applied.</p>',
                        durationSeconds: 600,
                        minimumSeconds: 300,
                      },
                      {
                        title: 'Site-specific procedure',
                        position: 2,
                        contentType: 'DOCUMENT',
                        body: '<p>Refer to the site procedure document for equipment-specific steps.</p>',
                        durationSeconds: 300,
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
      include: { versions: true },
    });

    const version = course.versions[0]!;
    await tenant.course.update({
      where: { id: course.id },
      data: { publishedVersionId: version.id },
    });

    // A final assessment for each course.
    const quiz = await tenant.quiz.create({
      data: {
        courseId: course.id,
        courseVersionId: version.id,
        title: `${spec.title} — Final Assessment`,
        isFinalAssessment: true,
        passingScore: 80,
        maxAttempts: 3,
        shuffleQuestions: true,
        showFeedback: true,
      },
    });

    const questions = [
      {
        type: 'MULTIPLE_CHOICE' as const,
        prompt: `What is the first thing you should do when you identify a ${spec.safetyCategory.toLowerCase()} hazard you are not trained for?`,
        options: [
          { text: 'Stop work and notify your supervisor', isCorrect: true },
          { text: 'Continue carefully and mention it later', isCorrect: false },
          { text: 'Ask a nearby colleague to do it instead', isCorrect: false },
          { text: 'Remove the guard so you can see the hazard better', isCorrect: false },
        ],
        explanation: 'Stop-work authority applies to every employee. Escalate before proceeding.',
      },
      {
        type: 'TRUE_FALSE' as const,
        prompt: `${spec.title} training at this organization must be renewed periodically.`,
        options: [
          { text: 'True', isCorrect: spec.renewalIntervalDays !== null },
          { text: 'False', isCorrect: spec.renewalIntervalDays === null },
        ],
        explanation:
          spec.renewalIntervalDays === null
            ? 'This course does not carry a renewal interval.'
            : `This course is set to renew every ${spec.renewalIntervalDays} days.`,
      },
      {
        type: 'MULTIPLE_SELECT' as const,
        prompt:
          'Which of the following are required before beginning the task? Select all that apply.',
        options: [
          { text: 'Confirm you are trained and authorised', isCorrect: true },
          { text: 'Inspect the equipment and PPE', isCorrect: true },
          { text: 'Notify affected employees', isCorrect: true },
          { text: 'Disable the alarm so it does not interrupt you', isCorrect: false },
        ],
        explanation: 'Authorisation, inspection and notification all precede the work.',
      },
    ];

    let position = 1;
    for (const spec2 of questions) {
      const question = await tenant.question.create({
        data: {
          type: spec2.type,
          prompt: spec2.prompt,
          explanation: spec2.explanation,
          points: 1,
          tags: [spec.safetyCategory],
          options: {
            create: spec2.options.map((option, index) => ({
              organizationId: org.id,
              text: option.text,
              isCorrect: option.isCorrect,
              position: index + 1,
            })),
          },
        },
      });
      await tenant.quizQuestion.create({
        data: { quizId: quiz.id, questionId: question.id, position },
      });
      position += 1;
    }

    courses.set(spec.slug, {
      courseId: course.id,
      versionId: version.id,
      renewal: spec.renewalIntervalDays,
    });
  }

  // --- Practical assessment template --------------------------------------
  const lotoCourse = courses.get('lockout-tagout')!;
  const practicalTemplate = await tenant.practicalAssessmentTemplate.create({
    data: {
      name: 'Lockout/Tagout Practical Assessment',
      description: 'Observed demonstration of the energy control procedure on live equipment.',
      courseVersionId: lotoCourse.versionId,
      requireAllCriteria: true,
      requiresEmployeeAcknowledgment: true,
      criteria: {
        create: LOTO_CRITERIA.map((criterion, index) => ({
          organizationId: org.id,
          text: criterion.text,
          isCritical: criterion.isCritical,
          position: index + 1,
          weight: criterion.isCritical ? 2 : 1,
        })),
      },
    },
    include: { criteria: true },
  });

  // --- Training requirements ----------------------------------------------
  interface RequirementSpec {
    name: string;
    slug: string;
    scopeType:
      | 'ORGANIZATION'
      | 'JOB_ROLE'
      | 'DEPARTMENT'
      | 'HAZARD_EXPOSURE'
      | 'EQUIPMENT_AUTHORIZATION';
    target?: string;
    dueWithinDays: number;
    basis: string;
  }

  const requirementSpecs: RequirementSpec[] = [
    {
      name: 'Hazard Communication — all employees',
      slug: 'hazard-communication',
      scopeType: 'ORGANIZATION',
      dueWithinDays: 30,
      basis: 'Company EHS policy ACME-EHS-001; chemicals are present site-wide.',
    },
    {
      name: 'Emergency Response — all employees',
      slug: 'emergency-response',
      scopeType: 'ORGANIZATION',
      dueWithinDays: 30,
      basis: 'Emergency action plan requires all personnel to know evacuation routes.',
    },
    {
      name: 'PPE — plant employees',
      slug: 'personal-protective-equipment',
      scopeType: 'DEPARTMENT',
      target: 'Maintenance',
      dueWithinDays: 30,
      basis: 'PPE hazard assessment for the maintenance shop.',
    },
    {
      name: 'Lockout/Tagout — maintenance technicians',
      slug: 'lockout-tagout',
      scopeType: 'JOB_ROLE',
      target: 'Maintenance Technician',
      dueWithinDays: 30,
      basis: 'Authorised employees under the energy control programme.',
    },
    {
      name: 'Machine Guarding — machine operators',
      slug: 'machine-guarding',
      scopeType: 'JOB_ROLE',
      target: 'Machine Operator',
      dueWithinDays: 45,
      basis: 'Operators work at the point of operation daily.',
    },
    {
      name: 'Electrical Safety — electrical exposure',
      slug: 'electrical-safety',
      scopeType: 'HAZARD_EXPOSURE',
      target: 'electrical',
      dueWithinDays: 60,
      basis: 'Roles with electrical exposure identified in the hazard assessment.',
    },
    {
      name: 'Confined Space Entry — confined space exposure',
      slug: 'confined-space-entry',
      scopeType: 'HAZARD_EXPOSURE',
      target: 'confined-space',
      dueWithinDays: 60,
      basis: 'Permit-required confined spaces exist at both plants.',
    },
    {
      name: 'Forklift Safety — authorised operators',
      slug: 'forklift-safety',
      scopeType: 'EQUIPMENT_AUTHORIZATION',
      target: 'forklift',
      dueWithinDays: 30,
      basis: 'Only trained and evaluated operators may operate powered industrial trucks.',
    },
  ];

  const requirements = new Map<
    string,
    { id: string; courseId: string; slug: string; dueWithinDays: number }
  >();

  for (const spec of requirementSpecs) {
    const course = courses.get(spec.slug)!;
    const requirement = await tenant.trainingRequirement.create({
      data: {
        name: spec.name,
        courseId: course.courseId,
        scopeType: spec.scopeType,
        departmentId: spec.scopeType === 'DEPARTMENT' ? departments.get(spec.target!) : null,
        jobRoleId: spec.scopeType === 'JOB_ROLE' ? jobRoles.get(spec.target!) : null,
        hazardExposure: spec.scopeType === 'HAZARD_EXPOSURE' ? spec.target : null,
        equipmentKey: spec.scopeType === 'EQUIPMENT_AUTHORIZATION' ? spec.target : null,
        dueWithinDays: spec.dueWithinDays,
        isMandatory: true,
        isActive: true,
        basis: spec.basis,
        createdById: users.get('ehs@acme.test') as string,
      },
    });
    requirements.set(spec.name, {
      id: requirement.id,
      courseId: course.courseId,
      slug: spec.slug,
      dueWithinDays: spec.dueWithinDays,
    });
  }

  // --- Employees, assignments, records, certificates ----------------------
  const employeeIds = new Map<string, string>();

  for (const spec of ACME_EMPLOYEES) {
    const employee = await tenant.employee.create({
      data: {
        employeeNumber: spec.employeeNumber,
        firstName: spec.firstName,
        lastName: spec.lastName,
        email: `${spec.firstName.toLowerCase()}.${spec.lastName.toLowerCase()}@acme.test`,
        departmentId: departments.get(spec.department),
        locationId: locations.get(spec.location),
        jobRoleId: jobRoles.get(spec.jobRole),
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        shift: spec.shift,
        hireDate: daysAgo(spec.hireYearsAgo * 365 + 14),
        equipmentAuthorizations: spec.equipment,
        hazardExposures: spec.hazards,
        userId:
          spec.employeeNumber === 'E-1001'
            ? users.get('learner@acme.test')
            : spec.employeeNumber === 'E-1005'
              ? users.get('supervisor@acme.test')
              : spec.employeeNumber === 'E-1006'
                ? users.get('ehs@acme.test')
                : null,
      },
    });
    employeeIds.set(spec.employeeNumber, employee.id);
  }

  // Wire supervisors now that every employee row exists.
  for (const spec of ACME_EMPLOYEES) {
    if (!spec.supervisor) continue;
    await tenant.employee.update({
      where: { id: employeeIds.get(spec.employeeNumber) as string },
      data: { supervisorId: employeeIds.get(spec.supervisor) },
    });
  }

  // Resolve which requirements apply to each employee, then create the
  // assignment / record / certificate / compliance-state chain.
  const applicable = (spec: EmployeeSpec, requirementName: string): boolean => {
    const requirementSpec = requirementSpecs.find((r) => r.name === requirementName)!;
    switch (requirementSpec.scopeType) {
      case 'ORGANIZATION':
        return true;
      case 'DEPARTMENT':
        return spec.department === requirementSpec.target;
      case 'JOB_ROLE':
        return spec.jobRole === requirementSpec.target;
      case 'HAZARD_EXPOSURE': {
        const roleHazards =
          {
            'Maintenance Technician': ['hazardous-energy', 'electrical', 'mechanical'],
            'Machine Operator': ['mechanical', 'chemical'],
            'Forklift Operator': ['vehicle'],
            'Warehouse Supervisor': ['vehicle'],
            'EHS Specialist': ['chemical', 'confined-space'],
            'Office Administrator': [] as string[],
          }[spec.jobRole] ?? [];
        return [...roleHazards, ...spec.hazards].includes(requirementSpec.target as string);
      }
      case 'EQUIPMENT_AUTHORIZATION':
        return spec.equipment.includes(requirementSpec.target as string);
      default:
        return false;
    }
  };

  let recordCount = 0;
  let certificateCount = 0;

  for (const spec of ACME_EMPLOYEES) {
    const employeeId = employeeIds.get(spec.employeeNumber) as string;

    for (const [name, requirement] of requirements) {
      if (!applicable(spec, name)) continue;

      const course = courses.get(requirement.slug)!;
      const completedDaysAgo = spec.completed[requirement.slug];
      const isOverdue = (spec.overdue ?? []).includes(requirement.slug);
      const assignedAt = daysAgo(
        completedDaysAgo != null ? completedDaysAgo + 20 : isOverdue ? 120 : 25,
      );
      const dueAt = addDays(assignedAt, requirement.dueWithinDays);

      const assignment = await tenant.trainingAssignment.create({
        data: {
          employeeId,
          courseId: requirement.courseId,
          courseVersionId: course.versionId,
          requirementId: requirement.id,
          status: completedDaysAgo != null ? 'COMPLETED' : isOverdue ? 'OVERDUE' : 'ASSIGNED',
          origin: 'REQUIREMENT_ENGINE',
          assignedById: users.get('ehs@acme.test') as string,
          assignedAt,
          dueAt,
          startedAt: completedDaysAgo != null ? assignedAt : null,
          completedAt: completedDaysAgo != null ? daysAgo(completedDaysAgo) : null,
        },
      });

      if (completedDaysAgo == null) continue;

      const completedAt = daysAgo(completedDaysAgo);
      const courseSpec = SAFETY_COURSES.find((c) => c.slug === requirement.slug)!;
      const expiresAt = computeExpiresAt(completedAt, {
        renewalIntervalDays: course.renewal,
        basis: 'COMPLETION_DATE',
      });

      const record = await tenant.trainingRecord.create({
        data: {
          employeeId,
          courseId: requirement.courseId,
          courseVersionId: course.versionId,
          requirementId: requirement.id,
          assignmentId: assignment.id,
          courseTitle: courseSpec.title,
          courseVersionNumber: 1,
          trainingType: 'SAFETY_AWARENESS_TRAINING',
          deliveryMethod: courseSpec.deliveryMethod ?? 'ONLINE_SELF_PACED',
          instructorName: courseSpec.requiresPractical ? 'Dana Ruiz' : null,
          instructorId: courseSpec.requiresPractical ? users.get('trainer@acme.test') : null,
          trainingDate: completedAt,
          completedAt,
          durationMinutes: courseSpec.estimatedMinutes,
          creditHours: courseSpec.estimatedMinutes / 60,
          score: 80 + ((spec.employeeNumber.charCodeAt(4) + requirement.slug.length) % 20),
          passingScore: 80,
          passed: true,
          expiresAt,
          createdById: users.get('ehs@acme.test') as string,
        },
      });
      recordCount += 1;

      certificateSequence += 1;
      const issuedAt = completedAt;
      const publicId = generatePublicId();
      const certificateNumber = formatCertificateNumber({
        organizationSlug: org.slug,
        issuedAt,
        sequence: certificateSequence,
      });

      const integrityFields = {
        publicId,
        certificateNumber,
        organizationId: org.id,
        employeeId,
        courseVersionId: course.versionId,
        learnerName: `${spec.firstName} ${spec.lastName}`,
        courseTitle: courseSpec.title,
        completedAt,
        issuedAt,
        expiresAt,
      };

      await tenant.certificate.create({
        data: {
          ...integrityFields,
          integrityHash: certificateIntegrityHash(CERT_SECRET, integrityFields),
          trainingRecordId: record.id,
          courseId: requirement.courseId,
          status: expiresAt && expiresAt < NOW ? 'EXPIRED' : 'ACTIVE',
          organizationName: org.name,
          trainingType: 'SAFETY_AWARENESS_TRAINING',
          deliveryMethod: courseSpec.deliveryMethod ?? 'ONLINE_SELF_PACED',
          instructorName: courseSpec.requiresPractical ? 'Dana Ruiz' : null,
          durationMinutes: courseSpec.estimatedMinutes,
          creditHours: courseSpec.estimatedMinutes / 60,
          score: record.score,
          disclaimer: disclaimerFor(
            'SAFETY_AWARENESS_TRAINING',
            'Questions? Contact the Acme EHS team at ehs@acme.test.',
          ),
        },
      });
      certificateCount += 1;
    }
  }

  // --- Compliance states (what the sweep job would compute) ----------------
  let stateCount = 0;
  for (const spec of ACME_EMPLOYEES) {
    const employeeId = employeeIds.get(spec.employeeNumber) as string;

    for (const [name, requirement] of requirements) {
      // A compliance cell exists only for a requirement that actually applies.
      // That is the requirement engine's contract (see syncEmployeeRequirements),
      // and the matrix renders a missing cell as N/A. Writing NOT_APPLICABLE
      // rows here would leave the sweep re-deciding applicability on every run.
      if (!applicable(spec, name)) continue;

      const assignment = await tenant.trainingAssignment.findFirst({
        where: { employeeId, requirementId: requirement.id },
        orderBy: { assignedAt: 'desc' },
      });
      const record = await tenant.trainingRecord.findFirst({
        where: { employeeId, requirementId: requirement.id, voidedAt: null, supersededAt: null },
        orderBy: { completedAt: 'desc' },
      });

      const state = computeComplianceState({
        requirementId: requirement.id,
        courseId: requirement.courseId,
        employeeId,
        applicable: true,
        now: NOW,
        timezone: 'America/New_York',
        warningIntervalDays: [90, 60, 30, 14, 7, 1],
        record: record
          ? {
              id: record.id,
              completedAt: record.completedAt,
              expiresAt: record.expiresAt,
              passed: record.passed,
              voidedAt: record.voidedAt,
              supersededAt: record.supersededAt,
            }
          : null,
        assignment: assignment
          ? {
              id: assignment.id,
              status: assignment.status,
              dueAt: assignment.dueAt,
              startedAt: assignment.startedAt,
              waivedAt: assignment.waivedAt,
            }
          : null,
      });

      await tenant.complianceState.create({
        data: {
          employeeId,
          requirementId: requirement.id,
          courseId: requirement.courseId,
          status: state.status,
          dueAt: state.dueAt,
          completedAt: state.completedAt,
          expiresAt: state.expiresAt,
          daysUntilExpiry: state.daysUntilExpiry,
          latestRecordId: state.latestRecordId,
          assignmentId: state.assignmentId,
        },
      });
      stateCount += 1;
    }
  }

  // --- A practical assessment ---------------------------------------------
  await tenant.practicalAssessment.create({
    data: {
      templateId: practicalTemplate.id,
      employeeId: employeeIds.get('E-1002') as string,
      assessorId: users.get('trainer@acme.test') as string,
      assessorName: 'Dana Ruiz',
      assessedAt: daysAgo(30),
      passed: true,
      scorePercent: 100,
      comments:
        'Demonstrated the full procedure without prompting. Verification step was thorough.',
      assessorSignature: 'Dana Ruiz',
      assessorSignedAt: daysAgo(30),
      employeeAcknowledgedAt: daysAgo(30),
      employeeSignature: 'Jane Doe',
      results: {
        create: practicalTemplate.criteria.map((criterion) => ({
          organizationId: org.id,
          criterionId: criterion.id,
          result: 'PASS' as const,
        })),
      },
    },
  });

  // --- Training sessions and attendance -----------------------------------
  const upcomingSession = await tenant.trainingSession.create({
    data: {
      courseId: courses.get('forklift-safety')!.courseId,
      courseVersionId: courses.get('forklift-safety')!.versionId,
      title: 'Forklift Safety — Classroom and Evaluation',
      status: 'SCHEDULED',
      deliveryMethod: 'BLENDED',
      instructorId: users.get('trainer@acme.test') as string,
      instructorName: 'Dana Ruiz',
      locationId: locations.get('Plant 1 - Toledo') as string,
      room: 'Training Room A',
      startsAt: daysAhead(7),
      endsAt: addDays(daysAhead(7), 0),
      timezone: 'America/New_York',
      capacity: 12,
      checkInCode: randomUUID().slice(0, 8).toUpperCase(),
      checkInOpensAt: daysAhead(7),
      createdById: users.get('ehs@acme.test') as string,
    },
  });

  await tenant.attendanceEntry.createMany({
    data: [
      {
        sessionId: upcomingSession.id,
        employeeId: employeeIds.get('E-1001') as string,
        status: 'REGISTERED',
      },
      {
        sessionId: upcomingSession.id,
        employeeId: employeeIds.get('E-1008') as string,
        status: 'REGISTERED',
      },
    ],
  });

  const pastSession = await tenant.trainingSession.create({
    data: {
      courseId: courses.get('first-aid-cpr')!.courseId,
      courseVersionId: courses.get('first-aid-cpr')!.versionId,
      title: 'First Aid and CPR — Certification Class',
      status: 'COMPLETED',
      deliveryMethod: 'INSTRUCTOR_LED_CLASSROOM',
      instructorId: users.get('trainer@acme.test') as string,
      instructorName: 'Dana Ruiz',
      locationId: locations.get('Plant 1 - Toledo') as string,
      room: 'Training Room A',
      startsAt: daysAgo(60),
      endsAt: daysAgo(60),
      timezone: 'America/New_York',
      capacity: 12,
      createdById: users.get('ehs@acme.test') as string,
    },
  });

  await tenant.attendanceEntry.createMany({
    data: [
      {
        sessionId: pastSession.id,
        employeeId: employeeIds.get('E-1006') as string,
        status: 'PRESENT',
        method: 'QR_CHECK_IN',
        checkInAt: daysAgo(60),
        minutesAttended: 240,
      },
      {
        sessionId: pastSession.id,
        employeeId: employeeIds.get('E-1003') as string,
        status: 'ABSENT',
        method: 'MANUAL',
        notes: 'Called in sick; to be rescheduled.',
      },
    ],
  });

  // --- Safety operations ---------------------------------------------------
  const incident = await tenant.incident.create({
    data: {
      reference: 'INC-2026-014',
      title: 'Near miss: pallet fell from raised forks',
      description:
        'A pallet slipped from the forks while a load was being raised in Aisle 4. No one was ' +
        'struck. Load was not centred and the pallet was damaged.',
      severity: 'NEAR_MISS',
      status: 'CORRECTIVE_ACTION',
      occurredAt: daysAgo(12),
      reportedAt: daysAgo(12),
      reportedById: users.get('supervisor@acme.test') as string,
      locationId: locations.get('Plant 1 - Toledo') as string,
      areaDescription: 'Warehouse, Aisle 4',
      subjectEmployeeId: employeeIds.get('E-1004') as string,
      immediateCause: 'Load was not centred on the forks and the pallet was damaged before use.',
      rootCause:
        'Damaged pallets are not consistently removed from circulation, and the pre-use load ' +
        'check is not part of the current written procedure.',
      investigationNotes:
        'Reviewed with the operator and the warehouse supervisor. Recorded by EHS; no regulatory ' +
        'determination is made by this record.',
      investigatedById: users.get('ehs@acme.test') as string,
      investigationCompletedAt: daysAgo(9),
    },
  });

  await tenant.correctiveAction.create({
    data: {
      incidentId: incident.id,
      title: 'Refresher training on load handling for warehouse operators',
      description:
        'Assign Forklift Safety refresher to all authorised operators at Plant 1 and add a ' +
        'pre-use pallet inspection step to the written procedure.',
      status: 'IN_PROGRESS',
      ownerEmployeeId: employeeIds.get('E-1005') as string,
      dueAt: daysAhead(18),
      trainingCourseIds: [courses.get('forklift-safety')!.courseId],
      trainingAssignedAt: daysAgo(8),
      createdById: users.get('ehs@acme.test') as string,
    },
  });

  const jha = await tenant.jhaJsa.create({
    data: {
      reference: 'JHA-2026-003',
      title: 'Conveyor belt replacement — Line 2',
      jobDescription: 'Replacing the drive belt on the Line 2 conveyor during a planned shutdown.',
      locationId: locations.get('Plant 1 - Toledo') as string,
      status: 'APPROVED',
      overallRisk: 'HIGH',
      reviewedById: users.get('ehs@acme.test') as string,
      reviewedAt: daysAgo(45),
      nextReviewAt: daysAhead(320),
      createdById: users.get('ehs@acme.test') as string,
      tasks: {
        create: [
          {
            organizationId: org.id,
            step: 1,
            description: 'Isolate and lock out the conveyor drive',
            hazards: {
              create: [
                {
                  organizationId: org.id,
                  hazard: 'Unexpected start-up during servicing',
                  hazardCategory: 'hazardous-energy',
                  likelihood: 2,
                  severity: 5,
                  riskLevel: 'HIGH',
                  controls: [
                    'Apply personal lock and tag at the disconnect',
                    'Verify zero energy by attempting a start',
                  ],
                  recommendedCourseIds: [courses.get('lockout-tagout')!.courseId],
                },
              ],
            },
          },
          {
            organizationId: org.id,
            step: 2,
            description: 'Remove guarding and replace the belt',
            hazards: {
              create: [
                {
                  organizationId: org.id,
                  hazard: 'Pinch points at the drive roller',
                  hazardCategory: 'mechanical',
                  likelihood: 3,
                  severity: 3,
                  riskLevel: 'MEDIUM',
                  controls: ['Cut-resistant gloves', 'Two-person lift for the belt'],
                  recommendedCourseIds: [courses.get('machine-guarding')!.courseId],
                },
              ],
            },
          },
        ],
      },
    },
  });

  await tenant.safetyObservation.create({
    data: {
      type: 'UNSAFE_CONDITION',
      description: 'Emergency exit in the west bay partially blocked by staged pallets.',
      locationId: locations.get('Plant 1 - Toledo') as string,
      areaDescription: 'West bay, exit 3',
      departmentId: departments.get('Warehouse') as string,
      observedAt: daysAgo(3),
      reportedById: users.get('learner@acme.test') as string,
      riskLevel: 'MEDIUM',
      immediateActionTaken: 'Pallets moved; area marked with floor tape.',
      status: 'OPEN',
    },
  });

  // --- Announcements and an audit trail -----------------------------------
  await tenant.announcement.create({
    data: {
      title: 'Forklift refresher scheduled',
      body:
        'Following the near miss in Aisle 4, a Forklift Safety refresher and evaluation is ' +
        'scheduled for next week. All authorised operators at Plant 1 should attend.',
      authorId: users.get('ehs@acme.test') as string,
      pinned: true,
      publishedAt: daysAgo(8),
    },
  });

  await tenant.auditLog.createMany({
    data: [
      {
        organizationId: org.id,
        actorUserId: users.get('ehs@acme.test') as string,
        actorLabel: 'Elena Kowalski',
        action: 'COURSE_PUBLISHED',
        entityType: 'course_version',
        entityId: lotoCourse.versionId,
        summary: 'Published Lockout/Tagout version 1',
        occurredAt: daysAgo(400),
      },
      {
        organizationId: org.id,
        actorUserId: users.get('ehs@acme.test') as string,
        actorLabel: 'Elena Kowalski',
        action: 'TRAINING_REQUIREMENT_CREATED',
        entityType: 'training_requirement',
        summary: 'Created requirement: Forklift Safety — authorised operators',
        occurredAt: daysAgo(380),
      },
      {
        organizationId: org.id,
        actorUserId: users.get('supervisor@acme.test') as string,
        actorLabel: 'Marcus Webb',
        action: 'INCIDENT_REPORTED',
        entityType: 'incident',
        entityId: incident.id,
        summary: 'Reported INC-2026-014',
        occurredAt: daysAgo(12),
      },
      {
        organizationId: org.id,
        actorUserId: users.get('ehs@acme.test') as string,
        actorLabel: 'Elena Kowalski',
        action: 'CORRECTIVE_ACTION_CREATED',
        entityType: 'corrective_action',
        summary: 'Opened corrective action for INC-2026-014',
        occurredAt: daysAgo(9),
      },
      {
        organizationId: org.id,
        actorUserId: users.get('ehs@acme.test') as string,
        actorLabel: 'Elena Kowalski',
        action: 'SETTINGS_UPDATED',
        entityType: 'jha_jsa',
        entityId: jha.id,
        summary: 'Approved JHA-2026-003',
        occurredAt: daysAgo(45),
      },
    ],
  });

  console.log(
    `  ${org.name}: ${ACME_EMPLOYEES.length} employees, ${courses.size} courses, ` +
      `${requirements.size} requirements, ${recordCount} records, ${certificateCount} certificates, ` +
      `${stateCount} compliance states`,
  );
};

// ---------------------------------------------------------------------------
// Tenant 2 — Northgate Community College (academic)
// ---------------------------------------------------------------------------

const seedCollege = async (prisma: PrismaClient, planIds: Map<string, string>): Promise<void> => {
  const org = await prisma.organization.create({
    data: {
      slug: 'northgate-college',
      name: 'Northgate Community College',
      type: 'COLLEGE',
      status: 'ACTIVE',
      timezone: 'America/Chicago',
      primaryDomain: 'northgate.test',
      brandColor: '#7a1f3d',
    },
  });

  const tenant = forTenant(org.id, prisma);

  await prisma.subscription.create({
    data: {
      organizationId: org.id,
      planId: planIds.get('starter') as string,
      status: 'ACTIVE',
      currentPeriodStart: daysAgo(5),
      currentPeriodEnd: daysAhead(25),
      seatsPurchased: 50,
    },
  });

  const roleIds = await seedRoles(tenant);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const registrar = await createUser(
    tenant,
    roleIds,
    {
      email: 'registrar@northgate.test',
      firstName: 'Alice',
      lastName: 'Whitfield',
      role: 'ORG_ADMINISTRATOR',
    },
    passwordHash,
  );
  const professor = await createUser(
    tenant,
    roleIds,
    {
      email: 'professor@northgate.test',
      firstName: 'Samuel',
      lastName: 'Oduya',
      role: 'INSTRUCTOR',
    },
    passwordHash,
  );

  const department = await tenant.department.create({ data: { name: 'Engineering Technology' } });

  const students = [
    { email: 'student1@northgate.test', firstName: 'Mia', lastName: 'Chen', number: 'S-2001' },
    { email: 'student2@northgate.test', firstName: 'Leo', lastName: 'Fischer', number: 'S-2002' },
    { email: 'student3@northgate.test', firstName: 'Aisha', lastName: 'Bello', number: 'S-2003' },
    { email: 'student4@northgate.test', firstName: 'Owen', lastName: 'Pratt', number: 'S-2004' },
  ];

  const studentRecords: { userId: string; employeeId: string; name: string }[] = [];

  for (const spec of students) {
    const user = await createUser(
      tenant,
      roleIds,
      { email: spec.email, firstName: spec.firstName, lastName: spec.lastName, role: 'LEARNER' },
      passwordHash,
    );
    const employee = await tenant.employee.create({
      data: {
        firstName: spec.firstName,
        lastName: spec.lastName,
        email: spec.email,
        userId: user.id,
        departmentId: department.id,
        isStudent: true,
        studentNumber: spec.number,
        employeeNumber: spec.number,
        programOfStudy: 'Industrial Maintenance Technology',
        employmentType: 'PART_TIME',
      },
    });
    studentRecords.push({
      userId: user.id,
      employeeId: employee.id,
      name: `${spec.firstName} ${spec.lastName}`,
    });
  }

  const course = await tenant.course.create({
    data: {
      title: 'IMT 201 — Industrial Safety Systems',
      slug: 'imt-201',
      code: 'IMT201',
      summary:
        'Safety systems in an industrial environment: energy control, machine safeguarding and ' +
        'emergency planning.',
      type: 'ACADEMIC',
      status: 'PUBLISHED',
      ownerId: professor.id,
      versions: {
        create: {
          version: 1,
          title: 'IMT 201 — Industrial Safety Systems',
          description: 'Fall term, 15 weeks.',
          objectives: [
            'Explain the hierarchy of controls',
            'Analyse an energy control procedure',
            'Evaluate a machine safeguarding design',
          ],
          deliveryMethod: 'BLENDED',
          trainingType: 'ORGANIZATION_TRAINING',
          estimatedMinutes: 2_700,
          creditHours: 3,
          passingScore: 70,
          requiresFinalAssessment: true,
          publishedAt: daysAgo(60),
          publishedById: professor.id,
          modules: {
            create: [
              {
                title: 'Unit 1 — Hierarchy of controls',
                position: 1,
                lessons: {
                  create: [
                    {
                      title: 'Elimination through PPE',
                      position: 1,
                      contentType: 'RICH_TEXT',
                      body: '<p>The hierarchy of controls, from most to least effective.</p>',
                      durationSeconds: 2_400,
                    },
                  ],
                },
              },
              {
                title: 'Unit 2 — Energy control',
                position: 2,
                lessons: {
                  create: [
                    {
                      title: 'Written energy control procedures',
                      position: 1,
                      contentType: 'RICH_TEXT',
                      body: '<p>Anatomy of an energy control procedure and how to audit one.</p>',
                      durationSeconds: 2_400,
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
    include: { versions: true },
  });

  const version = course.versions[0]!;
  await tenant.course.update({
    where: { id: course.id },
    data: { publishedVersionId: version.id },
  });

  const categories = new Map<string, string>();
  for (const spec of [
    { name: 'Homework', weight: 30, dropLowest: 1 },
    { name: 'Quizzes', weight: 20, dropLowest: 0 },
    { name: 'Midterm', weight: 20, dropLowest: 0 },
    { name: 'Final Exam', weight: 30, dropLowest: 0 },
  ]) {
    const category = await tenant.gradebookCategory.create({
      data: {
        courseId: course.id,
        name: spec.name,
        weightPercent: spec.weight,
        dropLowest: spec.dropLowest,
      },
    });
    categories.set(spec.name, category.id);
  }

  const assignments = [];
  for (const spec of [
    {
      title: 'Homework 1 — Hierarchy of controls',
      category: 'Homework',
      points: 50,
      dueDaysAgo: 30,
    },
    { title: 'Homework 2 — Procedure critique', category: 'Homework', points: 50, dueDaysAgo: 14 },
    { title: 'Midterm — Energy control analysis', category: 'Midterm', points: 100, dueDaysAgo: 7 },
    { title: 'Homework 3 — Safeguarding design', category: 'Homework', points: 50, dueDaysAgo: -7 },
  ]) {
    const assignment = await tenant.assignment.create({
      data: {
        courseId: course.id,
        courseVersionId: version.id,
        categoryId: categories.get(spec.category) as string,
        title: spec.title,
        instructions: 'Submit a written response with references to the course material.',
        pointsPossible: spec.points,
        dueAt: daysAgo(spec.dueDaysAgo),
        allowLate: true,
        latePenaltyPercentPerDay: 10,
        maxLateDays: 5,
      },
    });
    assignments.push({ ...spec, id: assignment.id });
  }

  // Enrollments, submissions and grades, with a spread of outcomes.
  const scores: Record<string, number[]> = {
    'Mia Chen': [48, 47, 92],
    'Leo Fischer': [40, 35, 71],
    'Aisha Bello': [50, 49, 97],
    'Owen Pratt': [30, 0, 58],
  };

  for (const student of studentRecords) {
    await tenant.enrollment.create({
      data: {
        courseId: course.id,
        courseVersionId: version.id,
        userId: student.userId,
        status: 'IN_PROGRESS',
        progressPercent: 55,
        startedAt: daysAgo(58),
        lastAccessedAt: daysAgo(2),
      },
    });

    const studentScores = scores[student.name] as number[];

    for (const [index, assignment] of assignments.slice(0, 3).entries()) {
      const points = studentScores[index] as number;
      const isLate = student.name === 'Owen Pratt' && index === 1;

      const submission = await tenant.submission.create({
        data: {
          assignmentId: assignment.id,
          userId: student.userId,
          status: points === 0 ? 'MISSING' : 'GRADED',
          body: points === 0 ? null : 'Submitted response.',
          submittedAt: points === 0 ? null : daysAgo(assignment.dueDaysAgo + (isLate ? -2 : 1)),
          isLate,
          lateDays: isLate ? 2 : 0,
        },
      });

      await tenant.grade.create({
        data: {
          courseId: course.id,
          categoryId: categories.get(assignment.category) as string,
          studentId: student.userId,
          assignmentId: assignment.id,
          submissionId: submission.id,
          source: 'ASSIGNMENT',
          pointsEarned: isLate ? Math.max(0, points - assignment.points * 0.2) : points,
          pointsPossible: assignment.points,
          percent: (points / assignment.points) * 100,
          penaltyApplied: isLate ? assignment.points * 0.2 : null,
          recordedById: professor.id,
          postedAt: daysAgo(assignment.dueDaysAgo - 2),
          feedback:
            points === 0
              ? 'No submission received. Please contact me to discuss.'
              : 'Good use of the course material.',
        },
      });
    }
  }

  await tenant.discussion.create({
    data: {
      courseId: course.id,
      title: 'Week 6 — Is a guard always the right control?',
      description: 'Discuss where guarding sits in the hierarchy and when it is not enough.',
      createdById: professor.id,
      posts: {
        create: [
          {
            organizationId: org.id,
            authorId: professor.id,
            isInstructorPost: true,
            body:
              'Post one example from your own workplace or from a case study where a guard was ' +
              'used but a higher-order control was available.',
            createdAt: daysAgo(20),
          },
        ],
      },
    },
  });

  await tenant.auditLog.create({
    data: {
      organizationId: org.id,
      actorUserId: registrar.id,
      actorLabel: 'Alice Whitfield',
      action: 'COURSE_PUBLISHED',
      entityType: 'course_version',
      entityId: version.id,
      summary: 'Published IMT 201 version 1',
      occurredAt: daysAgo(60),
    },
  });

  console.log(
    `  ${org.name}: ${students.length} students, 1 course, ${assignments.length} assignments`,
  );
};

// ---------------------------------------------------------------------------
// Platform staff
// ---------------------------------------------------------------------------

const seedPlatformStaff = async (prisma: PrismaClient): Promise<void> => {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await prisma.user.create({
    data: {
      organizationId: null,
      email: 'platform@olbos.test',
      emailNormalized: 'platform@olbos.test',
      emailVerifiedAt: NOW,
      passwordHash,
      passwordUpdatedAt: NOW,
      firstName: 'Platform',
      lastName: 'Owner',
      status: 'ACTIVE',
      platformRole: 'PLATFORM_OWNER',
    },
  });

  console.log('  platform staff: 1');
};

// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const prisma = getPrismaClient();
  console.log('Seeding OLBOS development data...');

  // Re-runnable: clear only the demo tenants, leaving any other data alone.
  // The demo tenants own audit rows, which are append-only, so removing them
  // needs the privileged purge path rather than a plain cascade delete.
  await prisma.user.deleteMany({
    where: { organizationId: null, emailNormalized: 'platform@olbos.test' },
  });
  await purgeOrganizationsBySlug(prisma, ['acme-manufacturing', 'northgate-college']);

  const planIds = await seedPlans(prisma);
  await seedPlatformStaff(prisma);
  await seedAcme(prisma, planIds);
  await seedCollege(prisma, planIds);

  console.log('\nDemo accounts (all use the same password):');
  console.log(`  password: ${DEMO_PASSWORD}\n`);
  for (const account of [
    ['platform@olbos.test', 'Platform Owner'],
    ['owner@acme.test', 'Acme — Organization Owner'],
    ['ehs@acme.test', 'Acme — EHS Administrator'],
    ['hr@acme.test', 'Acme — HR Administrator'],
    ['supervisor@acme.test', 'Acme — Supervisor'],
    ['trainer@acme.test', 'Acme — Safety Trainer'],
    ['learner@acme.test', 'Acme — Employee'],
    ['registrar@northgate.test', 'Northgate — Administrator'],
    ['professor@northgate.test', 'Northgate — Instructor'],
    ['student1@northgate.test', 'Northgate — Student'],
  ]) {
    console.log(`  ${(account[0] as string).padEnd(28)} ${account[1]}`);
  }

  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error('Seed failed:', error);
  await getPrismaClient().$disconnect();
  process.exitCode = 1;
});
