import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ name: z.string().min(1) }));

  it('returns parsed data', () => {
    expect(pipe.transform({ name: 'GigaLibs' })).toEqual({ name: 'GigaLibs' });
  });

  it('returns a structured validation error', () => {
    expect(() => pipe.transform({ name: '' })).toThrow(BadRequestException);
  });
});
