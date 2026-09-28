import { PERMISSIONS_KEY } from '@gigalibs/rbac-nest';
import { describe, expect, it } from 'vitest';
import { ConfigurationStudioController } from './configuration-studio.controller.js';

describe('ConfigurationStudioController TP-1 authorization metadata', () => {
  it('requires both runtime and administrative read permissions for preview', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, ConfigurationStudioController.prototype.previewRuntime),
    ).toEqual(['configuration-runtime:read', 'configuration:read']);
  });

  it('requires only runtime read permission for the server-resolved current endpoint', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, ConfigurationStudioController.prototype.currentRuntime),
    ).toEqual(['configuration-runtime:read']);
  });
});
