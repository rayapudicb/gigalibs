import { SetMetadata } from '@nestjs/common';

export const REQUIRED_SCOPES_KEY = 'platform_context.required_scopes';
export const RequireScopes = (...scopes: string[]) => SetMetadata(REQUIRED_SCOPES_KEY, scopes);

export const REQUIRED_AUDIENCE_KEY = 'platform_context.required_audience';
export const RequireAudience = (audience: string) => SetMetadata(REQUIRED_AUDIENCE_KEY, audience);

export const REQUIRED_MODULE_KEY = 'platform_context.required_module';
export const RequireModule = (moduleKey: string) => SetMetadata(REQUIRED_MODULE_KEY, moduleKey);
