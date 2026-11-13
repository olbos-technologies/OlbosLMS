import { describe, expect, it } from 'vitest';
import { TenantIsolationError } from './errors.js';
import {
  belongsToTenant,
  isTenantOwnedModel,
  scopeData,
  scopeOperation,
  scopeWhere,
  TENANT_OWNED_MODELS,
  type RelationMap,
} from './tenancy.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

const relations: RelationMap = new Map([
  [
    'Course',
    new Map([
      ['versions', 'CourseVersion'],
      ['organization', 'Organization'],
    ]),
  ],
  ['CourseVersion', new Map([['modules', 'CourseModule']])],
  ['CourseModule', new Map([['lessons', 'Lesson']])],
  ['Lesson', new Map()],
]);

describe('tenant model catalogue', () => {
  it('is sorted and free of duplicates', () => {
    const sorted = [...TENANT_OWNED_MODELS].sort();
    expect([...TENANT_OWNED_MODELS]).toEqual(sorted);
    expect(new Set(TENANT_OWNED_MODELS).size).toBe(TENANT_OWNED_MODELS.length);
  });

  it('recognises tenant-owned and platform models', () => {
    expect(isTenantOwnedModel('TrainingRecord')).toBe(true);
    expect(isTenantOwnedModel('Certificate')).toBe(true);
    expect(isTenantOwnedModel('Organization')).toBe(false);
    expect(isTenantOwnedModel('Plan')).toBe(false);
    expect(isTenantOwnedModel(undefined)).toBe(false);
  });
});

describe('scopeWhere', () => {
  it('adds the tenant filter to an empty where', () => {
    expect(scopeWhere(undefined, TENANT_A, 'Course', 'findMany')).toEqual({
      organizationId: TENANT_A,
    });
  });

  it('preserves existing filters', () => {
    expect(scopeWhere({ status: 'PUBLISHED' }, TENANT_A, 'Course', 'findMany')).toEqual({
      status: 'PUBLISHED',
      organizationId: TENANT_A,
    });
  });

  it('accepts a matching explicit tenant', () => {
    expect(scopeWhere({ organizationId: TENANT_A }, TENANT_A, 'Course', 'findMany')).toEqual({
      organizationId: TENANT_A,
    });
  });

  it('rejects a foreign explicit tenant', () => {
    expect(() => scopeWhere({ organizationId: TENANT_B }, TENANT_A, 'Course', 'findMany')).toThrow(
      TenantIsolationError,
    );
  });

  it('ANDs a tenant filter object so it can only narrow', () => {
    const result = scopeWhere(
      { organizationId: { in: [TENANT_A, TENANT_B] } },
      TENANT_A,
      'Course',
      'findMany',
    );
    expect(result).toEqual({
      AND: [{ organizationId: TENANT_A }, { organizationId: { in: [TENANT_A, TENANT_B] } }],
    });
  });
});

describe('scopeOperation', () => {
  it('filters findMany', () => {
    const { args, verifyResultTenant } = scopeOperation(
      'Course',
      'findMany',
      { where: { type: 'SAFETY' } },
      TENANT_A,
      relations,
    );
    expect(args).toEqual({ where: { type: 'SAFETY', organizationId: TENANT_A } });
    expect(verifyResultTenant).toBe(false);
  });

  it('leaves findUnique args alone but demands post-verification', () => {
    const { args, verifyResultTenant } = scopeOperation(
      'Course',
      'findUnique',
      { where: { id: 'abc' } },
      TENANT_A,
      relations,
    );
    expect(args).toEqual({ where: { id: 'abc' } });
    expect(verifyResultTenant).toBe(true);
  });

  it('stamps the tenant on create', () => {
    const { args } = scopeOperation(
      'Course',
      'create',
      { data: { title: 'LOTO' } },
      TENANT_A,
      relations,
    );
    expect(args.data).toEqual({ title: 'LOTO', organizationId: TENANT_A });
  });

  it('stamps the tenant on every row of createMany', () => {
    const { args } = scopeOperation(
      'Course',
      'createMany',
      { data: [{ title: 'A' }, { title: 'B' }] },
      TENANT_A,
      relations,
    );
    expect(args.data).toEqual([
      { title: 'A', organizationId: TENANT_A },
      { title: 'B', organizationId: TENANT_A },
    ]);
  });

  it('rejects a create that names another tenant', () => {
    expect(() =>
      scopeOperation(
        'Course',
        'create',
        { data: { title: 'LOTO', organizationId: TENANT_B } },
        TENANT_A,
        relations,
      ),
    ).toThrow(TenantIsolationError);
  });

  it('filters update, delete and updateMany by tenant', () => {
    for (const operation of ['update', 'delete', 'updateMany', 'deleteMany']) {
      const { args } = scopeOperation(
        'Course',
        operation,
        { where: { id: 'abc' }, data: { title: 'x' } },
        TENANT_A,
        relations,
      );
      expect(args.where).toEqual({ id: 'abc', organizationId: TENANT_A });
    }
  });

  it('does not re-stamp the tenant on an update payload', () => {
    const { args } = scopeOperation(
      'Course',
      'update',
      { where: { id: 'abc' }, data: { title: 'x' } },
      TENANT_A,
      relations,
    );
    expect(args.data).toEqual({ title: 'x' });
  });

  it('scopes both halves of an upsert', () => {
    const { args } = scopeOperation(
      'Course',
      'upsert',
      { where: { id: 'abc' }, create: { title: 'new' }, update: { title: 'old' } },
      TENANT_A,
      relations,
    );
    expect(args.where).toEqual({ id: 'abc', organizationId: TENANT_A });
    expect(args.create).toEqual({ title: 'new', organizationId: TENANT_A });
    expect(args.update).toEqual({ title: 'old' });
  });
});

describe('nested writes', () => {
  it('stamps the tenant through a three-level nested create', () => {
    const scoped = scopeData(
      {
        title: 'Lockout/Tagout',
        versions: {
          create: {
            version: 1,
            modules: {
              create: [
                { title: 'Energy sources', lessons: { create: { title: 'Identify' } } },
                { title: 'Verification' },
              ],
            },
          },
        },
      },
      TENANT_A,
      'Course',
      'create',
      relations,
      true,
    ) as any;

    expect(scoped.organizationId).toBe(TENANT_A);
    expect(scoped.versions.create.organizationId).toBe(TENANT_A);
    expect(scoped.versions.create.modules.create[0].organizationId).toBe(TENANT_A);
    expect(scoped.versions.create.modules.create[0].lessons.create.organizationId).toBe(TENANT_A);
    expect(scoped.versions.create.modules.create[1].organizationId).toBe(TENANT_A);
  });

  it('stamps nested createMany payloads', () => {
    const scoped = scopeData(
      { version: 1, modules: { createMany: { data: [{ title: 'M1' }, { title: 'M2' }] } } },
      TENANT_A,
      'CourseVersion',
      'create',
      relations,
      true,
    ) as any;
    expect(scoped.modules.createMany.data).toEqual([
      { title: 'M1', organizationId: TENANT_A },
      { title: 'M2', organizationId: TENANT_A },
    ]);
  });

  it('rejects a nested create that names another tenant', () => {
    expect(() =>
      scopeData(
        { title: 'x', versions: { create: { version: 1, organizationId: TENANT_B } } },
        TENANT_A,
        'Course',
        'create',
        relations,
        true,
      ),
    ).toThrow(TenantIsolationError);
  });

  it('leaves non-tenant relations untouched', () => {
    const scoped = scopeData(
      { title: 'x', organization: { connect: { id: TENANT_A } } },
      TENANT_A,
      'Course',
      'create',
      relations,
      true,
    ) as any;
    expect(scoped.organization).toEqual({ connect: { id: TENANT_A } });
  });
});

describe('belongsToTenant', () => {
  it('accepts a row from the tenant', () => {
    expect(belongsToTenant({ id: '1', organizationId: TENANT_A }, TENANT_A)).toBe(true);
  });

  it('rejects a row from another tenant', () => {
    expect(belongsToTenant({ id: '1', organizationId: TENANT_B }, TENANT_A)).toBe(false);
  });

  it('accepts rows that carry no tenant column (selected subsets)', () => {
    expect(belongsToTenant({ id: '1' }, TENANT_A)).toBe(true);
  });
});
