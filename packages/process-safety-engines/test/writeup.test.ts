import { describe, expect, it } from 'vitest';
import { parseWriteup, recogniseReagents } from '../src/writeup.js';
import { WRITEUPS } from './fixtures/writeups.js';

// WI-OI-120cc (SPEED S8; FR-INP-07, 08; D8): the deterministic write-up parser. TEST FIXTURE text only.

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

describe('write-up parser (FR-INP-07)', () => {
  it('reads at least 90 % of the annotated quantities correctly over the 20 procedures, with no value invented', () => {
    let expected = 0;
    let correct = 0;
    let extra = 0;
    for (const writeup of WRITEUPS) {
      const found = parseWriteup(writeup.text).filter((finding) => finding.type !== 'DOSING');
      const unmatched = [...found];
      for (const quantity of writeup.expected) {
        expected += 1;
        const index = unmatched.findIndex(
          (finding) =>
            finding.type === quantity.type &&
            finding.value !== null &&
            close(finding.value, quantity.value),
        );
        if (index >= 0) {
          correct += 1;
          unmatched.splice(index, 1);
        }
      }
      extra += unmatched.length;
    }
    expect(WRITEUPS).toHaveLength(20);
    expect(correct / expected).toBeGreaterThanOrEqual(0.9);
    // Anything found beyond the annotations is offered for confirmation, never applied; it should stay rare.
    expect(extra / expected).toBeLessThanOrEqual(0.1);
  });

  it('converts units and takes a range’s upper bound, keeping the lower one', () => {
    const [range] = parseWriteup('Kept at 0–5 °C.');
    expect(range).toMatchObject({ type: 'TEMPERATURE', value: 5, low: 0, found: '0–5 °C' });
    expect(parseWriteup('Heated to 104 °F.')[0]?.value).toBe(40);
    expect(parseWriteup('Charged 1.25 kg.')[0]).toMatchObject({ type: 'MASS', value: 1250 });
    expect(parseWriteup('Added 60 µL.')[0]).toMatchObject({ type: 'VOLUME', value: 0.06 });
    expect(parseWriteup('Stirred for 1.5 hours.')[0]).toMatchObject({ type: 'TIME', value: 90 });
  });

  it('does not read formulas, temperature differences or words as quantities', () => {
    expect(parseWriteup('C14H15FO3 and K2CO3 in 2-MeTHF; ΔTad 21 K; 3 steps.')).toEqual([]);
  });

  it('reports dosing statements as the sentence that holds them', () => {
    const dosing = parseWriteup(
      'First line. NaOH was added dropwise over 30 min at 0 °C. Then stirred.',
    ).filter((finding) => finding.type === 'DOSING');
    expect(dosing).toHaveLength(1);
    expect(dosing[0]).toMatchObject({
      value: null,
      found: 'NaOH was added dropwise over 30 min at 0 °C',
    });
  });
});

describe('reagent recognition (FR-INP-08)', () => {
  const substances = [
    { id: 's1', name: 'Sodium hydroxide', formula: 'NaOH', casNumber: '1310-73-2' },
    { id: 's2', name: 'Dimethyl sulfoxide', formula: 'C2H6OS', casNumber: '67-68-5' },
    { id: 's3', name: 'Water', formula: 'H2O', casNumber: '7732-18-5' },
    { id: 's4', name: 'Ethanol', formula: 'C2H6O', casNumber: null },
  ];

  it('names the workspace substances the text mentions, by name, CAS number or formula, each once', () => {
    const found = recogniseReagents(
      'NaOH in dimethyl sulfoxide; then 67-68-5 again and sodium hydroxide.',
      substances,
    );
    expect(found.map((reagent) => reagent.substanceId)).toEqual(['s1', 's2']);
    expect(found[0]).toMatchObject({ found: 'NaOH', start: 0 });
  });

  it('matches whole words only, and a formula only as written', () => {
    expect(recogniseReagents('Waterproof gloves; h2o; ethanolamine.', substances)).toEqual([]);
  });
});
