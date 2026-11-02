import { describe, expect, it } from 'vitest';
import {
  CONTRACTOR_QUIZ_CORRECT,
  generateContractorPassSecret,
  hashContractorPassSecret,
  scoreContractorQuiz,
} from './contractor.js';

describe('contractor pass contracts (WI-OI-143)', () => {
  it('scores the fixed induction quiz', () => {
    expect(scoreContractorQuiz(CONTRACTOR_QUIZ_CORRECT)).toBe(3);
    expect(scoreContractorQuiz({ q1: 'A', q2: 'A', q3: 'A' })).toBe(1);
  });

  it('hashes pass secrets deterministically', () => {
    const secret = generateContractorPassSecret();
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    expect(hashContractorPassSecret(secret)).toMatch(/^[a-f0-9]{64}$/);
  });
});
