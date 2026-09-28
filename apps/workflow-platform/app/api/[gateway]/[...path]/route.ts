import { moduleGatewayRoute } from '@/lib/module-gateway';

export const runtime = 'nodejs';

// WI-OI-083d: the one same-origin BFF route for every module gateway the built solution's manifests declare
// (`spec.gateway`); see lib/module-gateway.ts. Modules route GET, POST and PATCH only.
export const GET = moduleGatewayRoute;
export const POST = moduleGatewayRoute;
export const PATCH = moduleGatewayRoute;
