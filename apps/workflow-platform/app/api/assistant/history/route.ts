import { canUseAssistantPreview } from '@/lib/assistant-preview-access';
import { verifiedSession } from '@/lib/verified-session';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!canUseAssistantPreview(session.context)) {
    return Response.json({ error: 'Assistant unavailable' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  // The old ChatChannel had tenant scope but no per-user thread owner. Do not reveal or mutate it.
  return Response.json(
    { error: 'Private Assistant history is unavailable until per-user ownership and retention are implemented' },
    { status: 410, headers: { 'cache-control': 'no-store' } },
  );
}
