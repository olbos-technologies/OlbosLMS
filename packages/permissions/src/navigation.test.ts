import { describe, expect, it } from 'vitest';
import { buildNavigation, NAVIGATION, navigationHrefs } from './navigation.js';
import { ROLE_TEMPLATES } from './roles.js';
import { type AccessContext } from './policy.js';
import { isPermission } from './permissions.js';

const ALL_ENTITLEMENTS = [
  'CERTIFICATES',
  'TRAINING_MATRIX',
  'SAFETY_MODULE',
  'PRACTICAL_ASSESSMENTS',
  'INCIDENT_MANAGEMENT',
  'ADVANCED_ANALYTICS',
  'AI_TUTOR',
  'AI_COURSE_BUILDER',
  'AI_QUESTION_GENERATOR',
  'AI_SCENARIO_GENERATOR',
  'AI_ANALYTICS_ASSISTANT',
];

const ctxFor = (key: keyof typeof ROLE_TEMPLATES): AccessContext => ({
  userId: 'u',
  organizationId: 'org',
  platformRole: 'NONE',
  roles: [{ key, permissions: ROLE_TEMPLATES[key].permissions, scopeType: 'ORGANIZATION' }],
  employeeId: 'emp',
});

const idsOf = (sections: ReturnType<typeof buildNavigation>): string[] =>
  sections.flatMap((section) => section.items.map((item) => item.id));

describe('navigation tree integrity', () => {
  it('references only real permissions', () => {
    for (const section of NAVIGATION) {
      for (const item of section.items) {
        expect(item.anyOf.length).toBeGreaterThan(0);
        for (const permission of item.anyOf) {
          expect(`${item.id}:${permission}:${isPermission(permission)}`).toBe(
            `${item.id}:${permission}:true`,
          );
        }
      }
    }
  });

  it('uses unique item ids', () => {
    const ids = NAVIGATION.flatMap((s) => s.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses absolute hrefs', () => {
    for (const href of navigationHrefs()) expect(href.startsWith('/')).toBe(true);
  });

  it('covers every section named in the product specification', () => {
    expect(NAVIGATION.map((s) => s.id)).toEqual([
      'command-center',
      'discovery',
      'learning',
      'training',
      'safety',
      'academics',
      'content',
      'people',
      'compliance',
      'analytics',
      'ai',
      'reports',
      'administration',
    ]);
  });
});

describe('role-aware filtering', () => {
  it('shows a learner only their own learning surfaces', () => {
    const ids = idsOf(buildNavigation(ctxFor('LEARNER'), { entitlements: ALL_ENTITLEMENTS }));
    expect(ids).toContain('my-learning');
    expect(ids).toContain('my-certificates');
    expect(ids).not.toContain('training-matrix');
    expect(ids).not.toContain('admin-users');
    expect(ids).not.toContain('compliance-dashboard');
    expect(ids).not.toContain('safety-command');
  });

  it('shows an EHS administrator the whole safety surface', () => {
    const ids = idsOf(
      buildNavigation(ctxFor('EHS_ADMINISTRATOR'), { entitlements: ALL_ENTITLEMENTS }),
    );
    expect(ids).toContain('safety-command');
    expect(ids).toContain('training-matrix');
    expect(ids).toContain('incidents');
    expect(ids).toContain('jha');
    expect(ids).toContain('audit-history');
    expect(ids).not.toContain('admin-billing');
    expect(ids).not.toContain('admin-security');
  });

  it('shows a supervisor team compliance but no administration', () => {
    const ids = idsOf(buildNavigation(ctxFor('SUPERVISOR'), { entitlements: ALL_ENTITLEMENTS }));
    expect(ids).toContain('compliance-dashboard');
    expect(ids).toContain('training-matrix');
    expect(ids).not.toContain('admin-users');
    expect(ids).not.toContain('course-builder');
  });

  it('shows an owner everything the plan allows', () => {
    const ids = idsOf(buildNavigation(ctxFor('ORG_OWNER'), { entitlements: ALL_ENTITLEMENTS }));
    expect(ids).toContain('admin-billing');
    expect(ids).toContain('safety-command');
    expect(ids).toContain('ai-tutor');
  });
});

describe('entitlement gating', () => {
  it('hides the safety module when the plan does not include it', () => {
    const ids = idsOf(buildNavigation(ctxFor('EHS_ADMINISTRATOR'), { entitlements: [] }));
    expect(ids).not.toContain('safety-command');
    expect(ids).not.toContain('training-matrix');
    expect(ids).not.toContain('incidents');
  });

  it('hides AI features when the plan does not include them', () => {
    const ids = idsOf(
      buildNavigation(ctxFor('ORG_OWNER'), { entitlements: ['SAFETY_MODULE', 'CERTIFICATES'] }),
    );
    expect(ids).not.toContain('ai-tutor');
    expect(ids).not.toContain('ai-course-builder');
    expect(ids).toContain('safety-command');
  });

  it('drops sections that end up empty', () => {
    const sections = buildNavigation(ctxFor('LEARNER'), { entitlements: [] });
    expect(sections.map((s) => s.id)).not.toContain('administration');
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });
});

describe('planned routes', () => {
  it('marks unbuilt routes as unavailable rather than hiding them', () => {
    const sections = buildNavigation(ctxFor('ORG_OWNER'), { entitlements: ALL_ENTITLEMENTS });
    const planned = sections.flatMap((s) => s.items).filter((i) => i.status === 'planned');
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((i) => i.available === false)).toBe(true);
  });

  it('can omit planned routes entirely', () => {
    const sections = buildNavigation(ctxFor('ORG_OWNER'), {
      entitlements: ALL_ENTITLEMENTS,
      includePlanned: false,
    });
    expect(sections.flatMap((s) => s.items).every((i) => i.available)).toBe(true);
  });
});
