import { moduleGatewayRoute } from '@/lib/module-gateway';

export const runtime = 'nodejs';

// WI-OI-083d: the one same-origin BFF route for every module gateway the built solution's manifests declare
// (`spec.gateway`); see lib/module-gateway.ts. A method reaches a module only on a route its manifest lists with that
// method (WI-OI-120h: PUT and DELETE too, with the same same-site check and write headers as POST and PATCH).
export const GET = moduleGatewayRoute;
export const POST = moduleGatewayRoute;
export const PATCH = moduleGatewayRoute;
export const PUT = moduleGatewayRoute;
export const DELETE = moduleGatewayRoute;
