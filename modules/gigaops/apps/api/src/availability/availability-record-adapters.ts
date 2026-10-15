import type {
  AbsenceTypeV1,
  AbsenceV1,
  AvailabilityPatternV1,
  BookingV1,
  WorkingCalendarV1,
} from '@gigalibs/contracts';
import type {
  LookupResolver,
  ModulePrincipal,
  RecordAdapter,
  RecordCommandContext,
  RecordListQuery,
  RecordValues,
} from '@gigalibs/module-sdk';
import { BadRequestException } from '@nestjs/common';
import type { BookingsService } from '../bookings/bookings.service.js';
import { instantOf, localOf } from '../common/local-time.js';
import {
  domain,
  command,
  expectedVersion,
  orNull,
  pageOf,
  pick,
  reasonOf,
  versioned,
} from '../common/record-kit.js';
import type { AvailabilityService } from './availability.service.js';
import { formatWeek, parseWeek } from './working-week.js';

// WI-OI-120u (M-WF1 Slice 2): availability, absences, absence types, calendars and bookings behind metadata windows,
// over the existing domain services, which keep every rule (four-eyes decisions, own absences only for
// workforce.absences.request-own, place scope). Times are shown and taken in the person's working time zone.

export interface AvailabilityRecordDependencies {
  readonly availability: AvailabilityService;
  readonly bookings: BookingsService;
}

const policy = (writable: readonly string[], readable: readonly string[]) =>
  Object.fromEntries([
    ...writable.map((key) => [key, { writable: true }]),
    ...readable.map((key) => [key, { writable: false }]),
  ]);

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

function required(values: RecordValues, key: string, label: string): string {
  const value = text(values[key]);
  if (!value)
    throw new BadRequestException({
      code: 'WORKFORCE_VALIDATION_FAILED',
      message: `${label} is required.`,
    });
  return value;
}

/** Records matching a search over some of their text, case-insensitive. */
const matching = <T>(
  items: readonly T[],
  search: string | undefined,
  words: (item: T) => readonly (string | null)[],
) =>
  search
    ? items.filter((item) =>
        words(item).some((word) => word?.toLowerCase().includes(search.toLowerCase())),
      )
    : items;

/** The working time zone of each person among the records (UTC for people without a working pattern). */
async function zonesOf(
  deps: AvailabilityRecordDependencies,
  principal: ModulePrincipal,
  resourceIds: readonly string[],
) {
  const zones = await deps.availability.workingTimeZones(domain(principal), resourceIds);
  return (resourceId: string) => zones.get(resourceId) ?? 'UTC';
}

// ─── Working weeks (availability patterns): a tab of People and a window of their own ───────────────────

function patternToWindow(pattern: AvailabilityPatternV1): RecordValues {
  return {
    id: pattern.id,
    version: pattern.version,
    'resource-id': pattern.resourceId,
    'effective-from': pattern.effectiveFrom,
    'effective-to': pattern.effectiveTo,
    'time-zone': pattern.timeZone,
    'working-hours': formatWeek(pattern.weeklySlots),
    'weekly-hours': (pattern.weeklyMinutes / 60).toFixed(2),
    'created-at': pattern.createdAt,
  };
}

function patternAdapter(deps: AvailabilityRecordDependencies): RecordAdapter {
  return {
    rest: {
      read: 'GET v1/availability-patterns',
      create: 'POST v1/availability-patterns',
      actions: { end: 'POST v1/availability-patterns/{id}/end' },
    },
    entityKey: 'wf.availability-patterns',
    permissions: { read: 'workforce.availability.read', create: 'workforce.availability.manage' },
    parentField: 'resource-id',
    fields: policy(
      ['resource-id', 'effective-from', 'effective-to', 'time-zone', 'working-hours'],
      ['weekly-hours', 'created-at'],
    ),
    searchFields: ['resource-id'],
    async list(principal, query) {
      if (query.parentId) {
        const { items } = await deps.availability.listPatterns(domain(principal), query.parentId);
        return pageOf(items.map(patternToWindow), query);
      }
      const { items } = await deps.availability.listAllPatterns(domain(principal));
      return pageOf(
        matching(items, query.search, (pattern) => [pattern.resourceName]).map(patternToWindow),
        query,
      );
    },
    async get(principal, id) {
      const pattern = await orNull(() => deps.availability.getPattern(domain(principal), id));
      return pattern ? patternToWindow(pattern) : null;
    },
    async create(context, values) {
      const pattern = await deps.availability.createPattern(command(context), {
        resourceId: required(values, 'resource-id', 'Person'),
        effectiveFrom: required(values, 'effective-from', 'Starts on'),
        ...(text(values['effective-to']) ? { effectiveTo: text(values['effective-to']) } : {}),
        timeZone: required(values, 'time-zone', 'Time zone'),
        weeklySlots: parseWeek(required(values, 'working-hours', 'Working hours')),
      });
      return patternToWindow(pattern);
    },
    actions: {
      end: {
        permission: 'workforce.availability.manage',
        run: async (context, id, parameters) =>
          patternToWindow(
            await versioned(() =>
              deps.availability.endPattern(command(context), id, {
                expectedVersion: expectedVersion(parameters),
                effectiveTo: required(
                  parameters,
                  'effective-to',
                  'The first day without this week',
                ),
              }),
            ),
          ),
      },
    },
  };
}

// ─── Absences: a tab of People, and the decision window ─────────────────────────────────────────────────

const ABSENCE_ORDER: Record<AbsenceV1['status'], number> = {
  REQUESTED: 0,
  APPROVED: 1,
  REJECTED: 2,
  CANCELLED: 3,
};

function absenceToWindow(absence: AbsenceV1, zone: string): RecordValues {
  return {
    id: absence.id,
    version: absence.version,
    'resource-id': absence.resourceId,
    'absence-type-id': absence.absenceTypeId,
    'starts-at': localOf(absence.startsAt, zone),
    'ends-at': localOf(absence.endsAt, zone),
    'time-zone': zone,
    status: absence.status,
    note: absence.note,
    'decided-at': absence.decidedAt ? localOf(absence.decidedAt, zone) : null,
    'decision-reason': absence.decisionReason,
    'created-at': absence.createdAt,
  };
}

/** The absence's span as instants, from wall-clock text in the person's working time zone. */
const span = (values: RecordValues, zone: string) => ({
  absenceTypeId: required(values, 'absence-type-id', 'Absence type'),
  startsAt: instantOf(required(values, 'starts-at', 'From'), zone),
  endsAt: instantOf(required(values, 'ends-at', 'Until'), zone),
  ...(text(values.note) ? { note: text(values.note) } : {}),
});

async function absencesToWindow(
  deps: AvailabilityRecordDependencies,
  principal: ModulePrincipal,
  absences: readonly AbsenceV1[],
) {
  const zoneOf = await zonesOf(
    deps,
    principal,
    absences.map((absence) => absence.resourceId),
  );
  return absences.map((absence) => absenceToWindow(absence, zoneOf(absence.resourceId)));
}

async function oneAbsenceToWindow(
  deps: AvailabilityRecordDependencies,
  principal: ModulePrincipal,
  absence: AbsenceV1,
) {
  const zoneOf = await zonesOf(deps, principal, [absence.resourceId]);
  return absenceToWindow(absence, zoneOf(absence.resourceId));
}

function absenceAdapter(deps: AvailabilityRecordDependencies): RecordAdapter {
  const decide = (decision: 'APPROVED' | 'REJECTED') => ({
    permission: 'workforce.absences.approve',
    run: async (context: RecordCommandContext, id: string, parameters: RecordValues) => {
      const absence = await versioned(() =>
        deps.availability.decideAbsence(command(context), id, decision, {
          expectedVersion: expectedVersion(parameters),
          ...reasonOf(parameters),
        }),
      );
      return oneAbsenceToWindow(deps, context.principal, absence);
    },
  });
  return {
    rest: {
      read: 'GET v1/absences',
      create: 'POST v1/absences',
      actions: {
        approve: 'POST v1/absences/{id}/approve|reject',
        reject: 'POST v1/absences/{id}/approve|reject',
        cancel: 'POST v1/absences/{id}/cancel',
      },
    },
    entityKey: 'wf.absences',
    permissions: { read: 'workforce.absences.read', create: 'workforce.absences.request' },
    parentField: 'resource-id',
    fields: policy(
      ['resource-id', 'absence-type-id', 'starts-at', 'ends-at', 'note'],
      ['time-zone', 'status', 'decided-at', 'decision-reason', 'created-at'],
    ),
    searchFields: ['resource-id'],
    async list(principal, query) {
      const { items } = await deps.availability.listAbsences(
        domain(principal),
        query.parentId ? { resourceId: query.parentId } : {},
      );
      // Requests waiting for a decision first, then the newest.
      const ordered = query.parentId
        ? items
        : [...items].sort((a, b) => ABSENCE_ORDER[a.status] - ABSENCE_ORDER[b.status]);
      const found = matching(ordered, query.search, (absence) => [
        absence.resourceName,
        absence.absenceTypeName,
      ]);
      const page = pageOf(found, query);
      return { ...page, items: await absencesToWindow(deps, principal, page.items) };
    },
    async get(principal, id) {
      const absence = await orNull(() => deps.availability.getAbsence(domain(principal), id));
      return absence ? oneAbsenceToWindow(deps, principal, absence) : null;
    },
    async create(context, values) {
      const resourceId = required(values, 'resource-id', 'Person');
      const zoneOf = await zonesOf(deps, context.principal, [resourceId]);
      const absence = await deps.availability.requestAbsence(command(context), {
        resourceId,
        ...span(values, zoneOf(resourceId)),
      });
      return absenceToWindow(absence, zoneOf(resourceId));
    },
    actions: {
      approve: decide('APPROVED'),
      reject: decide('REJECTED'),
      cancel: {
        permission: 'workforce.absences.request',
        run: async (context, id, parameters) => {
          const absence = await versioned(() =>
            deps.availability.cancelAbsence(command(context), id, {
              expectedVersion: expectedVersion(parameters),
              ...reasonOf(parameters),
            }),
          );
          return oneAbsenceToWindow(deps, context.principal, absence);
        },
      },
    },
  };
}

// ─── My absences: the person linked to the caller's login (owner D1a) ───────────────────────────────────

function ownAbsenceAdapter(deps: AvailabilityRecordDependencies): RecordAdapter {
  const own = async (principal: ModulePrincipal, absence: AbsenceV1) => {
    const { 'resource-id': _person, ...values } = absenceToWindow(
      absence,
      await deps.availability.ownTimeZone(domain(principal)),
    );
    return values;
  };
  return {
    // Self-service on the caller's own absences only; REST has no routes for one's own absences.
    rest: { read: null, create: null, actions: { cancel: null } },
    entityKey: 'wf.my-absences',
    permissions: {
      read: 'workforce.absences.request-own',
      create: 'workforce.absences.request-own',
    },
    fields: policy(
      ['absence-type-id', 'starts-at', 'ends-at', 'note'],
      ['time-zone', 'status', 'decided-at', 'decision-reason', 'created-at'],
    ),
    async list(principal, query) {
      const { items } = await deps.availability.listOwnAbsences(domain(principal));
      const zone = await deps.availability.ownTimeZone(domain(principal));
      return pageOf(
        items.map((absence) => {
          const { 'resource-id': _person, ...values } = absenceToWindow(absence, zone);
          return values as RecordValues;
        }),
        query,
      );
    },
    async get(principal, id) {
      const absence = await orNull(() => deps.availability.getOwnAbsence(domain(principal), id));
      return absence ? own(principal, absence) : null;
    },
    async create(context, values) {
      const zone = await deps.availability.ownTimeZone(domain(context.principal));
      return own(
        context.principal,
        await deps.availability.requestOwnAbsence(command(context), span(values, zone)),
      );
    },
    actions: {
      cancel: {
        permission: 'workforce.absences.request-own',
        run: async (context, id, parameters) =>
          own(
            context.principal,
            await versioned(() =>
              deps.availability.cancelOwnAbsence(command(context), id, {
                expectedVersion: expectedVersion(parameters),
                ...reasonOf(parameters),
              }),
            ),
          ),
      },
    },
  };
}

// ─── Absence types ──────────────────────────────────────────────────────────────────────────────────────

function absenceTypeToWindow(type: AbsenceTypeV1): RecordValues {
  return {
    id: type.id,
    version: type.version,
    code: type.code,
    name: type.name,
    paid: type.paid,
    'requires-approval': type.requiresApproval,
    status: type.status,
  };
}

function absenceTypeAdapter(deps: AvailabilityRecordDependencies): RecordAdapter {
  const find = async (principal: ModulePrincipal, id: string) =>
    (await deps.availability.listAbsenceTypes(domain(principal))).items.find(
      (type) => type.id === id,
    ) ?? null;
  const setStatus = (status: 'ACTIVE' | 'INACTIVE') => ({
    permission: 'workforce.calendars.manage',
    run: async (context: RecordCommandContext, id: string, parameters: RecordValues) =>
      absenceTypeToWindow(
        await versioned(() =>
          deps.availability.updateAbsenceType(command(context), id, {
            expectedVersion: expectedVersion(parameters),
            status,
          }),
        ),
      ),
  });
  return {
    rest: {
      read: 'GET v1/absence-types',
      create: 'POST v1/absence-types',
      update: 'PATCH v1/absence-types/{id}',
      actions: {
        deactivate: 'PATCH v1/absence-types/{id}',
        activate: 'PATCH v1/absence-types/{id}',
      },
    },
    entityKey: 'wf.absence-types',
    permissions: {
      read: 'workforce.absences.read',
      create: 'workforce.calendars.manage',
      update: 'workforce.calendars.manage',
    },
    fields: policy(['code', 'name', 'paid', 'requires-approval'], ['status']),
    async list(principal, query) {
      const { items } = await deps.availability.listAbsenceTypes(domain(principal));
      return pageOf(items.map(absenceTypeToWindow), query);
    },
    async get(principal, id) {
      const type = await find(principal, id);
      return type ? absenceTypeToWindow(type) : null;
    },
    async create(context, values) {
      return absenceTypeToWindow(
        await deps.availability.createAbsenceType(command(context), {
          code: required(values, 'code', 'Code'),
          name: required(values, 'name', 'Name'),
          ...(typeof values.paid === 'boolean' ? { paid: values.paid } : {}),
          ...(typeof values['requires-approval'] === 'boolean'
            ? { requiresApproval: values['requires-approval'] }
            : {}),
        }),
      );
    },
    async update(context, id, values, version) {
      if ('code' in values)
        throw new BadRequestException({
          code: 'WORKFORCE_VALIDATION_FAILED',
          message: 'An absence type code cannot change.',
        });
      return absenceTypeToWindow(
        await versioned(() =>
          deps.availability.updateAbsenceType(command(context), id, {
            expectedVersion: version,
            ...(text(values.name) ? { name: text(values.name) } : {}),
            ...(typeof values.paid === 'boolean' ? { paid: values.paid } : {}),
            ...(typeof values['requires-approval'] === 'boolean'
              ? { requiresApproval: values['requires-approval'] }
              : {}),
          }),
        ),
      );
    },
    actions: { deactivate: setStatus('INACTIVE'), activate: setStatus('ACTIVE') },
  };
}

// ─── Site calendars and their closures ──────────────────────────────────────────────────────────────────

function calendarToWindow(calendar: WorkingCalendarV1): RecordValues {
  return {
    id: calendar.id,
    version: calendar.version,
    code: calendar.code,
    name: calendar.name,
    'site-ref': calendar.siteRef,
    'closure-count': calendar.closures.length,
  };
}

function calendarAdapter(deps: AvailabilityRecordDependencies): RecordAdapter {
  return {
    rest: { read: 'GET v1/working-calendars', create: 'POST v1/working-calendars' },
    entityKey: 'wf.calendars',
    permissions: { read: 'workforce.calendars.read', create: 'workforce.calendars.manage' },
    fields: policy(['code', 'name', 'site-ref'], ['closure-count']),
    async list(principal, query) {
      const { items } = await deps.availability.listCalendars(domain(principal));
      return pageOf(items.map(calendarToWindow), query);
    },
    async get(principal, id) {
      const calendar = (await deps.availability.listCalendars(domain(principal))).items.find(
        (candidate) => candidate.id === id,
      );
      return calendar ? calendarToWindow(calendar) : null;
    },
    async create(context, values) {
      return calendarToWindow(
        await deps.availability.createCalendar(command(context), {
          code: required(values, 'code', 'Code'),
          name: required(values, 'name', 'Name'),
          siteRef: text(values['site-ref']) ?? null,
        }),
      );
    },
  };
}

interface Closure {
  readonly id: string;
  readonly calendarId: string;
  readonly calendarName: string;
  readonly closureDate: string;
  readonly label: string;
  readonly status: string;
}

const closureToWindow = (closure: Closure): RecordValues => ({
  id: closure.id,
  'calendar-id': closure.calendarId,
  'closure-date': closure.closureDate,
  label: closure.label,
  status: closure.status,
});

const closuresOf = (calendars: readonly WorkingCalendarV1[]): Closure[] =>
  calendars
    .flatMap((calendar) =>
      calendar.closures.map((closure) => ({
        ...closure,
        calendarId: calendar.id,
        calendarName: calendar.name,
      })),
    )
    .sort((a, b) => a.closureDate.localeCompare(b.closureDate));

function closureAdapter(deps: AvailabilityRecordDependencies): RecordAdapter {
  const find = async (principal: ModulePrincipal, id: string) =>
    closuresOf((await deps.availability.listCalendars(domain(principal))).items).find(
      (closure) => closure.id === id,
    ) ?? null;
  return {
    rest: {
      read: 'GET v1/working-calendars',
      create: 'POST v1/working-calendars/{id}/closures',
      actions: { withdraw: 'POST v1/working-calendars/{id}/closures/{id}/withdraw' },
    },
    entityKey: 'wf.calendar-closures',
    permissions: { read: 'workforce.calendars.read', create: 'workforce.calendars.manage' },
    fields: policy(['calendar-id', 'closure-date', 'label'], ['status']),
    searchFields: ['label'],
    async list(principal, query) {
      const closures = closuresOf((await deps.availability.listCalendars(domain(principal))).items);
      return pageOf(
        matching(closures, query.search, (closure) => [closure.label, closure.calendarName]).map(
          closureToWindow,
        ),
        query,
      );
    },
    async get(principal, id) {
      const closure = await find(principal, id);
      return closure ? closureToWindow(closure) : null;
    },
    async create(context, values) {
      const calendarId = required(values, 'calendar-id', 'Calendar');
      const closureDate = required(values, 'closure-date', 'Date');
      const calendar = await deps.availability.addClosure(command(context), calendarId, {
        closureDate,
        label: required(values, 'label', 'Label'),
      });
      const added = closuresOf([calendar]).find((closure) => closure.closureDate === closureDate);
      if (!added)
        throw new BadRequestException({
          code: 'WORKFORCE_VALIDATION_FAILED',
          message: 'The closure was not added.',
        });
      return closureToWindow(added);
    },
    actions: {
      withdraw: {
        permission: 'workforce.calendars.manage',
        run: async (context, id) => {
          const closure = await find(context.principal, id);
          if (!closure)
            throw new BadRequestException({
              code: 'WORKFORCE_VALIDATION_FAILED',
              message: 'The closure is already withdrawn.',
            });
          await deps.availability.withdrawClosure(command(context), closure.calendarId, closure.id);
          return closureToWindow({ ...closure, status: 'WITHDRAWN' });
        },
      },
    },
  };
}

// ─── Bookings: read only (made and moved on the dispatch board) ─────────────────────────────────────────

function bookingToWindow(booking: BookingV1, zone: string): RecordValues {
  return {
    id: booking.id,
    version: booking.version,
    'requirement-title': booking.requirementTitle,
    'resource-id': booking.resourceId,
    'site-ref': booking.siteRef,
    'starts-at': localOf(booking.startsAt, zone),
    'ends-at': localOf(booking.endsAt, zone),
    'time-zone': zone,
    status: booking.status,
    'override-reason': booking.overrideReason,
    'cancel-reason': booking.cancelReason,
    'created-at': booking.createdAt,
  };
}

function bookingAdapter(deps: AvailabilityRecordDependencies): RecordAdapter {
  const toWindow = async (principal: ModulePrincipal, bookings: readonly BookingV1[]) => {
    const zoneOf = await zonesOf(
      deps,
      principal,
      bookings.map((booking) => booking.resourceId),
    );
    return bookings.map((booking) => bookingToWindow(booking, zoneOf(booking.resourceId)));
  };
  return {
    rest: { read: 'GET v1/bookings' },
    entityKey: 'wf.bookings',
    permissions: { read: 'workforce.bookings.read' },
    fields: policy(
      [],
      [
        'requirement-title',
        'resource-id',
        'site-ref',
        'starts-at',
        'ends-at',
        'time-zone',
        'status',
        'override-reason',
        'cancel-reason',
        'created-at',
      ],
    ),
    searchFields: ['requirement-title'],
    sortFields: ['starts-at'],
    async list(principal, query: RecordListQuery) {
      const { items } = await deps.bookings.listBookings(domain(principal), {});
      const found = matching(items, query.search, (booking) => [
        booking.requirementTitle,
        booking.resourceName,
      ]);
      const sorted = [...found].sort(
        (a, b) => a.startsAt.localeCompare(b.startsAt) * (query.sortDirection === 'DESC' ? -1 : 1),
      );
      const page = pageOf(sorted, query);
      return { ...page, items: await toWindow(principal, page.items) };
    },
    async get(principal, id) {
      const booking = await orNull(() => deps.bookings.getBooking(domain(principal), id));
      return booking
        ? bookingToWindow(
            booking,
            (await zonesOf(deps, principal, [booking.resourceId]))(booking.resourceId),
          )
        : null;
    },
  };
}

// ─── Pickers ────────────────────────────────────────────────────────────────────────────────────────────

function absenceTypeLookup(deps: AvailabilityRecordDependencies): LookupResolver {
  return {
    key: 'wf-absence-types',
    // Names of absence types are workspace settings anyone in Workforce may see; a person picks one for their own request.
    permission: 'workforce:read',
    async resolve(principal, request) {
      const { items } = await deps.availability.listAbsenceTypes(domain(principal));
      return pick(items, request, (type) => ({
        value: type.id,
        label: type.name,
        active: type.status === 'ACTIVE',
      }));
    },
  };
}

function calendarLookup(deps: AvailabilityRecordDependencies): LookupResolver {
  return {
    key: 'wf-calendars',
    permission: 'workforce.calendars.read',
    async resolve(principal, request) {
      const { items } = await deps.availability.listCalendars(domain(principal));
      return pick(items, request, (calendar) => ({
        value: calendar.id,
        label: `${calendar.name} (${calendar.code})`,
        active: true,
      }));
    },
  };
}

export const availabilityAdapters = (deps: AvailabilityRecordDependencies): RecordAdapter[] => [
  patternAdapter(deps),
  absenceAdapter(deps),
  ownAbsenceAdapter(deps),
  absenceTypeAdapter(deps),
  calendarAdapter(deps),
  closureAdapter(deps),
  bookingAdapter(deps),
];

export const availabilityLookups = (deps: AvailabilityRecordDependencies): LookupResolver[] => [
  absenceTypeLookup(deps),
  calendarLookup(deps),
];
