import { describe, expect, it } from 'vitest';

import { BUILTIN_SCHEMAS } from './builtins';

describe('BUILTIN_SCHEMAS', () => {
  const schemaNames = BUILTIN_SCHEMAS.map((s) => s.name);

  it('includes all six MVP schemas', () => {
    expect(schemaNames).toContain('person');
    expect(schemaNames).toContain('meeting');
    expect(schemaNames).toContain('captured-note');
    expect(schemaNames).toContain('next-action');
    expect(schemaNames).toContain('decision');
    expect(schemaNames).toContain('open-question');
  });

  it('each schema has a fullPageTemplate', () => {
    for (const schema of BUILTIN_SCHEMAS) {
      expect(schema.fullPageTemplate, `${schema.name} missing fullPageTemplate`).toBeTruthy();
    }
  });

  it('each schema has a summaryTemplate', () => {
    for (const schema of BUILTIN_SCHEMAS) {
      expect(schema.summaryTemplate, `${schema.name} missing summaryTemplate`).toBeTruthy();
    }
  });

  it('each schema has a folder', () => {
    for (const schema of BUILTIN_SCHEMAS) {
      expect(schema.folder, `${schema.name} missing folder`).toBeTruthy();
    }
  });

  it('next-action has default status of open', () => {
    const nextAction = BUILTIN_SCHEMAS.find((s) => s.name === 'next-action');
    expect(nextAction?.defaultValues?.['status']).toBe('open');
  });

  it('person schema folder is Entities/People', () => {
    const person = BUILTIN_SCHEMAS.find((s) => s.name === 'person');
    expect(person?.folder).toBe('Entities/People');
  });
});
