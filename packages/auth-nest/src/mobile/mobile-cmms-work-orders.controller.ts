import { Body, Controller, Get, Header, Headers, Logger, Param, Post, Query } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, answerMobile, forwardMobileCmms } from './mobile-cmms-forward.js';

// WI-OI-164: the mobile work-order adapter — my work (assigned to me or booked for me, WI-OI-169), one work order with
// its offered actions (WI-OI-163), the actions themselves and the supervisor's sign-off queue. Answers use the app's
// strict v1 shapes (`mobile-cmms-work-order-page.v1`, `mobile-cmms-work-order-detail.v1`); CMMS re-checks everything.

const ACTIONS = new Set(['start', 'hold', 'resume', 'complete', 'sign-off']);
const STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']);
const LENSES = new Set(['today', 'upcoming', 'previous']);
const PRINCIPAL = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;
const DAY_MS = 86_400_000;

type Values = Record<string, unknown>;
const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;
const instant = (value: unknown): string | null => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);

/** A CMMS work order as the app's `CmmsWorkOrderSummaryV1`. */
export function mobileWorkOrderSummary(order: Values) {
  const assigned = typeof order.assignedTo === 'string' && PRINCIPAL.test(order.assignedTo) ? order.assignedTo : null;
  return {
    id: String(order.id),
    workOrderNumber: text(order.woNumber, 100) ?? String(order.id),
    type: order.type,
    priority: order.priority,
    status: order.status,
    title: text(order.title, 240) ?? String(order.woNumber ?? order.id),
    description: typeof order.description === 'string' ? order.description.slice(0, 10_000) : null,
    asset: typeof order.assetId === 'string' ? { id: order.assetId, displayName: text(order.assetName, 240) } : null,
    // The place reference needs Geospatial's identity (name, type, path); until the adapter reads it, none is claimed.
    place: null,
    assignedResourceId: assigned,
    dueAt: instant(order.dueAt),
    startedAt: instant(order.startedAt),
    completedAt: instant(order.completedAt),
    requiredSignature: order.requiresSignature === true,
    version: Number(order.version),
    updatedAt: instant(order.updatedAt) ?? new Date().toISOString(),
  };
}

/** A CMMS work-order detail as the app's `CmmsWorkOrderDetailV1`. */
export function mobileWorkOrderDetail(order: Values) {
  const summary = mobileWorkOrderSummary(order);
  const tasks = (Array.isArray(order.tasks) ? (order.tasks as Values[]) : []).slice(0, 50).map((task) => ({
    id: String(task.id),
    position: Number(task.position),
    label: text(task.label, 240) ?? 'Task',
    required: task.required === true,
    status: task.status,
    resultValue: typeof task.resultValue === 'number' && Number.isFinite(task.resultValue) ? task.resultValue : null,
    notes: typeof task.notes === 'string' && task.notes.trim() ? task.notes.trim().slice(0, 2_000) : null,
    version: Number(task.version),
  }));
  return {
    contractVersion: 'mobile-cmms-work-order-detail.v1' as const,
    workOrder: summary,
    outcome: text(order.completionNotes, 1_000),
    tasks,
    safetyNotices: [] as string[],
    // Task capture needs the app's form manifests on the server (/mobile/v1/forms/manifests), which do not exist yet; until
    // they do, none is offered, so the app never opens a form it cannot load (WI-OI-164 remaining item 1).
    captureSurface: null,
    generatedAt: new Date().toISOString(),
  };
}

/** The page cursor: the next page number, opaque to the app. */
const cursorFor = (page: number) => Buffer.from(JSON.stringify({ page }), 'utf8').toString('base64url');
function pageOf(cursor: string | undefined): number {
  if (!cursor) return 1;
  try {
    const page = (JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { page?: unknown }).page;
    if (typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= 10_000) return page;
  } catch {
    // fall through
  }
  throw new MobileProblemException('MOBILE_REQUEST_INVALID');
}

/** Today, Upcoming and Previous are due-date windows (UTC days), never statuses. */
export function lensWindow(lens: string | undefined, now = new Date()): { dueFrom?: string; dueBefore?: string } {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (lens === 'today') return { dueFrom: new Date(start).toISOString(), dueBefore: new Date(start + DAY_MS).toISOString() };
  if (lens === 'upcoming') return { dueFrom: new Date(start + DAY_MS).toISOString() };
  if (lens === 'previous') return { dueBefore: new Date(start).toISOString() };
  return {};
}

@Public()
@Controller('mobile/cmms/work-orders')
export class MobileCmmsWorkOrdersController {
  private readonly logger = new Logger(MobileCmmsWorkOrdersController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  /** My work: assigned to me or booked for me; filtered by the app's v1 list input and an optional due-date lens. */
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Headers() headers: RequestHeaders, @Query() query: Record<string, unknown>) {
    const search = this.searchFrom(query, { mine: true });
    return this.page(headers, search, 'cmms.work-orders.read');
  }

  /** The supervisor's queue: completed work not yet signed off. */
  @Get('awaiting-sign-off')
  @Header('Cache-Control', 'no-store')
  awaiting(@Headers() headers: RequestHeaders, @Query() query: Record<string, unknown>) {
    const search = this.searchFrom(query, { awaitingSignOff: true });
    return this.page(headers, search, 'cmms.work-orders.write');
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return answerMobile(this.logger, 'Mobile work order request', async () =>
      mobileWorkOrderDetail((await this.forward(headers, 'GET', `/v1/work-orders/${id}`, 'cmms.work-orders.read')) as Values),
    );
  }

  /** WI-OI-163: which actions this person may take on the work order now, and why not. */
  @Get(':id/actions')
  @Header('Cache-Control', 'no-store')
  offers(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return answerMobile(this.logger, 'Mobile work order request', () =>
      this.forward(headers, 'GET', `/v1/records/cmms.work-orders/${id}/actions`, 'cmms.work-orders.read'),
    );
  }

  /** Start, hold, resume, complete or sign off; CMMS checks the action's own permission and every guard. */
  @Post(':id/actions/:action')
  @Header('Cache-Control', 'no-store')
  act(@Headers() headers: RequestHeaders, @Param('id') id: string, @Param('action') action: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!ACTIONS.has(action)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Values) : {};
    const expectedVersion = body.expectedVersion;
    if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    const reason = text(body.reason, 1_000);
    if ((action === 'hold' || action === 'sign-off') && !reason) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return answerMobile(this.logger, 'Mobile work order request', async () => {
      await this.forward(headers, 'POST', `/v1/records/cmms.work-orders/${id}/actions/${action}`, 'cmms.work-orders.read', {
        expectedVersion,
        ...(reason ? { reason } : {}),
      });
      return mobileWorkOrderDetail((await this.forward(headers, 'GET', `/v1/work-orders/${id}`, 'cmms.work-orders.read')) as Values);
    });
  }

  private searchFrom(query: Record<string, unknown>, base: Values): Values {
    const known = new Set(['query', 'status', 'priority', 'placeId', 'cursor', 'pageSize', 'lens']);
    if (Object.keys(query).some((key) => !known.has(key))) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);
    const q = one('query')?.trim();
    const status = one('status');
    const priority = one('priority');
    const placeId = one('placeId');
    const lens = one('lens');
    const pageSize = one('pageSize') === undefined ? 25 : Number(one('pageSize'));
    if ((q !== undefined && (q.length < 1 || q.length > 200)) || (status && !STATUSES.has(status)) || (priority && !PRIORITIES.has(priority)) ||
      (placeId && !MOBILE_UUID.test(placeId)) || (lens && !LENSES.has(lens)) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return {
      ...base,
      page: pageOf(one('cursor')),
      pageSize,
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(placeId ? { siteRef: placeId } : {}),
      ...lensWindow(lens),
      sortField: 'dueAt',
      sortDirection: lens === 'previous' ? 'DESC' : 'ASC',
    };
  }

  private page(headers: RequestHeaders, search: Values, permission: string) {
    return answerMobile(this.logger, 'Mobile work order request', async () => {
      const result = (await this.forward(headers, 'POST', '/v1/work-orders/search', permission, search)) as Values;
      const items = (Array.isArray(result.items) ? (result.items as Values[]) : []).map(mobileWorkOrderSummary);
      const page = Number(search.page);
      const more = items.length > 0 && page * Number(search.pageSize) < Number(result.total ?? 0);
      return { contractVersion: 'mobile-cmms-work-order-page.v1' as const, items, nextCursor: more ? cursorFor(page + 1) : null, generatedAt: new Date().toISOString() };
    });
  }

  private uuid(id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private forward(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return forwardMobileCmms({
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_WORK_ORDER_CONFLICT', logger: this.logger,
      ...(body === undefined ? {} : { body }),
    });
  }
}
