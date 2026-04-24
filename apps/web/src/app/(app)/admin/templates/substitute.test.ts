import { describe, it, expect } from 'vitest';
import { substitute, sampleContext } from './substitute';

describe('substitute', () => {
  it('replaces known tokens with context values', () => {
    const r = substitute('Hi {{contact_first_name}} from {{company_name}}', sampleContext());
    expect(r.output).toBe('Hi Sarah from Roof Technologies');
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it('tolerates whitespace around token names', () => {
    const r = substitute('{{ contact_first_name }} and {{  rep_first_name  }}', sampleContext());
    expect(r.output).toBe('Sarah and Kirk');
  });

  it('is case-insensitive on tokens', () => {
    const r = substitute('{{Contact_First_Name}}', sampleContext());
    expect(r.output).toBe('Sarah');
  });

  it('leaves unknown tokens verbatim so typos surface', () => {
    const r = substitute('Hello {{conact_first_name}}', sampleContext());
    expect(r.output).toBe('Hello {{conact_first_name}}');
    expect(r.unknown).toEqual(['conact_first_name']);
  });

  it('tracks missing values when a known token has no data', () => {
    const r = substitute('Your city is {{partner_city}}', { partner: {} });
    expect(r.output).toBe('Your city is ');
    expect(r.missing).toEqual(['partner_city']);
    expect(r.unknown).toEqual([]);
  });

  it('resolves contact_name from first + last', () => {
    const r = substitute('{{contact_name}}', {
      contact: { firstName: 'Jane', lastName: 'Doe' },
    });
    expect(r.output).toBe('Jane Doe');
  });

  it('resolves rep_first_name by splitting name when firstName missing', () => {
    const r = substitute('{{rep_first_name}}', { rep: { name: 'Kirk McCoy' } });
    expect(r.output).toBe('Kirk');
  });

  it('substitutes repeated tokens', () => {
    const r = substitute('{{partner_name}} — {{partner_name}}', sampleContext());
    expect(r.output).toBe('Acme Insurance — Acme Insurance');
  });
});
