// Shared by the server route and the client workbench. Keep this module free of
// 'use client' so server components receive the real array, not a client reference.
export const GIGAOPS_SECTIONS = [
  'overview', 'resources', 'jobs', 'capabilities', 'availability',
  'scheduling', 'time', 'attendance', 'pay', 'compliance', 'analytics',
] as const;
export type GigaOpsSection = (typeof GIGAOPS_SECTIONS)[number];

export function isGigaOpsSection(value: string): value is GigaOpsSection {
  return (GIGAOPS_SECTIONS as readonly string[]).includes(value);
}
