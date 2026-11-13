import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/client/index.js';
import { TENANT_OWNED_MODELS } from './tenancy.js';

/**
 * Guards against schema drift: if someone adds a table with `organizationId`
 * and forgets to register it, the tenant client would happily serve it
 * unfiltered. This test fails the build instead.
 */
describe('tenant model catalogue matches the schema', () => {
  const modelsWithTenantColumn = Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'organizationId'))
    .map((model) => model.name)
    .sort();

  it('registers every model that carries organizationId', () => {
    expect([...TENANT_OWNED_MODELS].sort()).toEqual(modelsWithTenantColumn);
  });

  it('registers no model that lacks organizationId', () => {
    const known = new Set(modelsWithTenantColumn);
    expect(TENANT_OWNED_MODELS.filter((m) => !known.has(m))).toEqual([]);
  });
});
