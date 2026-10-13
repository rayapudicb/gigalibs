// Shared by the server route and the client workbench. Keep this module free of
// 'use client' so server components receive the real array, not a client reference.
// WI-OI-120u Slice 3 (U20a; owner "retire all", 2026-10-13): the WFO sections (workers, engagements, expenses,
// compliance, analytics) are retired; their screens showed WFO data that the API no longer serves.
export const GIGAOPS_SECTIONS = [
  'overview', 'resources', 'jobs', 'capabilities', 'availability', 'scheduling', 'time', 'attendance', 'pay',
] as const;
export type GigaOpsSection = (typeof GIGAOPS_SECTIONS)[number];

export function isGigaOpsSection(value: string): value is GigaOpsSection {
  return (GIGAOPS_SECTIONS as readonly string[]).includes(value);
}
