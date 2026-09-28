import { type AnalyticsRouteContext, proxyAnalytics } from '@/lib/analytics-proxy';

export const runtime = 'nodejs';

// WI-OI-064a: signed, allow-listed proxy to Analytics Studio. The former proxy, which fetched tokens from the
// service's own unauthenticated development issuer, is preserved only in scratch/wi-oi-064-originals.
export const GET = (request: Request, context: AnalyticsRouteContext) => proxyAnalytics(request, context);
export const POST = (request: Request, context: AnalyticsRouteContext) => proxyAnalytics(request, context);
