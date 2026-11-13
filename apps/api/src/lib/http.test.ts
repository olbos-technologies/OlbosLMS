import { describe, expect, it } from 'vitest';
import { booleanQuery, csvSafe, toCsv, toOrderBy, paginationSchema } from './http.js';

describe('booleanQuery', () => {
  it('parses the strings a query string actually carries', () => {
    for (const [input, expected] of [
      ['true', true],
      ['false', false],
      ['1', true],
      ['0', false],
      ['yes', true],
      ['no', false],
    ] as const) {
      expect(`${input}=${booleanQuery.parse(input)}`).toBe(`${input}=${expected}`);
    }
  });

  it('does not fall for JavaScript truthiness', () => {
    // `z.coerce.boolean()` would return true here, which silently inverts the
    // caller's intent on every `?flag=false`.
    expect(booleanQuery.parse('false')).toBe(false);
    expect(booleanQuery.parse('0')).toBe(false);
  });

  it('accepts real booleans unchanged', () => {
    expect(booleanQuery.parse(true)).toBe(true);
    expect(booleanQuery.parse(false)).toBe(false);
  });

  it('rejects anything else rather than guessing', () => {
    expect(() => booleanQuery.parse('maybe')).toThrow();
    expect(() => booleanQuery.parse('')).toThrow();
  });
});

describe('toOrderBy', () => {
  const pagination = paginationSchema.parse({});

  it('falls back to the default field', () => {
    expect(toOrderBy(pagination, ['name', 'createdAt'], 'name')).toEqual({ name: 'asc' });
  });

  it('honours an allowed field and direction', () => {
    const sorted = paginationSchema.parse({ sort: 'createdAt', order: 'desc' });
    expect(toOrderBy(sorted, ['name', 'createdAt'], 'name')).toEqual({ createdAt: 'desc' });
  });

  it('refuses a field the endpoint did not allow', () => {
    const sorted = paginationSchema.parse({ sort: 'passwordHash' });
    expect(() => toOrderBy(sorted, ['name'], 'name')).toThrow(/Cannot sort by/);
  });
});

describe('CSV output', () => {
  it('quotes values containing separators', () => {
    expect(toCsv([['a', 'b,c', 'd"e']])).toBe('a,"b,c","d""e"');
  });

  it('neutralises spreadsheet formula injection', () => {
    expect(csvSafe('=1+1')).toBe("'=1+1");
    expect(csvSafe('+SUM(A1)')).toBe("'+SUM(A1)");
    expect(csvSafe('-1')).toBe("'-1");
    expect(csvSafe('@import')).toBe("'@import");
    expect(csvSafe('Smith, John')).toBe('Smith, John');
  });
});
