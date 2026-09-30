import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import * as forms from '../app/api/forms/route';
import * as formById from '../app/api/forms/[id]/route';
import * as submissions from '../app/api/forms/[id]/submissions/route';
import * as publicForm from '../app/api/forms/public/[slug]/route';
import * as batchSubmit from '../app/api/forms/mobile/batch-submit/route';
import * as mobileSync from '../app/api/forms/mobile/sync/route';
import PublicFormPage from '../app/(public)/forms/q/[slug]/page';
import { verifiedSession } from '../lib/verified-session';

type Handler = () => Promise<Response>;
const handlers: Array<[string, Handler]> = [
  ['GET /api/forms', forms.GET],
  ['POST /api/forms', forms.POST],
  ['GET /api/forms/[id]', formById.GET],
  ['PATCH /api/forms/[id]', formById.PATCH],
  ['DELETE /api/forms/[id]', formById.DELETE],
  ['GET /api/forms/[id]/submissions', submissions.GET],
  ['POST /api/forms/[id]/submissions', submissions.POST],
  ['GET /api/forms/public/[slug]', publicForm.GET],
  ['POST /api/forms/public/[slug]', publicForm.POST],
  ['POST /api/forms/mobile/batch-submit', batchSubmit.POST],
  ['GET /api/forms/mobile/sync', mobileSync.GET],
];

// D2 review of 808b8d2 (owner-approved 2026-09-30): the other-stream forms routes stay contained until WI-OI-108.
describe('contained forms routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(handlers)('%s answers unavailable to a signed-in tenant member and performs nothing', async (_name, handler) => {
    vi.mocked(verifiedSession).mockResolvedValue({ context: { tenant: { id: 'tenant-1' } } } as never);
    const response = await handler();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
  });

  it.each(handlers)('%s requires a session', async (_name, handler) => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json({ detail: 'Authentication required.' }, { status: 401 }),
    } as never);
    expect((await handler()).status).toBe(401);
  });

  it('the public questionnaire page answers not found', () => {
    expect(() => PublicFormPage()).toThrow('NEXT_NOT_FOUND');
  });
});
