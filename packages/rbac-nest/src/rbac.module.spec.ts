import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { RbacModule } from './rbac.module.js';

describe('RbacModule runtime dependency wiring', () => {
  it('provides the Reflector token required by its guard', () => {
    const dynamicModule = RbacModule.forRoot({ globalGuard: false });

    expect(dynamicModule.providers).toContain(Reflector);
  });
});
