import { type GeospatialRouteContext, proxyGeospatial } from '@/lib/geospatial-proxy';

export const runtime = 'nodejs';

// WI-OI-063b: signed, allow-listed proxy to the certified Geospatial service. The former prototype proxy
// (browser authorization and caller tenant headers forwarded) is preserved only in scratch/wi-oi-063-originals.
export const GET = (request: Request, context: GeospatialRouteContext) => proxyGeospatial(request, context);
export const POST = (request: Request, context: GeospatialRouteContext) => proxyGeospatial(request, context);
export const PATCH = (request: Request, context: GeospatialRouteContext) => proxyGeospatial(request, context);
