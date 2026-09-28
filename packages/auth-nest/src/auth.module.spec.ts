import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AuthModule } from './auth.module.js';

describe('AuthModule runtime dependency wiring', () => {
  it('provides the Reflector token required by its guards', () => {
    const dynamicModule = AuthModule.forRoot({ globalGuard: false });

    expect(dynamicModule.providers).toContain(Reflector);
  });
});
