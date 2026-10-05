// UAT preview (WI-OI-120a; owner decision 2026-10-05: on the UAT instance every module is visible and nothing is
// hidden). The preview never changes a module's readiness in the catalogue. The owner removed the on-screen UAT labels
// on 2026-10-05 (WI-OI-120b); module status for testers lives in
// docs/audits/2026-10-04-production-readiness/uat-module-status.md.

/** The deployment setting that turns the preview on. Only the exact value `enabled` counts. */
export const UAT_PREVIEW_SETTING = 'GIGALIBS_UAT_PREVIEW';

/**
 * Whether this server runs as the UAT instance. In the browser the setting is never present, so client components
 * receive the answer from the server layout instead of calling this.
 */
export function uatPreviewEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return environment[UAT_PREVIEW_SETTING] === 'enabled';
}
