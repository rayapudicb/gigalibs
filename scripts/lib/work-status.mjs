// WI-OI-120aq (plan v3 step 0.6, owner decision D1a): what a work item's status claims, and the evidence each claim
// needs. Plan v3 rule 8: Built is code that exists; On UAT is deployed and verified there; Done is the Done checklist
// complete, with the owner's acceptance recorded. Replaced closes an item and names what replaces it (plan v3 §5).
// Used by scripts/verify-sdlc-governance.mjs; tested in packages/configuration-core/src/work-status.test.ts.

/**
 * @param {{ id: string, status: string, evidence: string }} row  one row of .pi/WORK_ITEMS.md
 * @param {readonly string[]} statusValues                         config/sdlc-governance.json `statusValues`
 * @returns {Array<[code: string, message: string]>}
 */
export function workStatusFindings({ id, status, evidence }, statusValues) {
  const findings = [];
  if (!statusValues.includes(status))
    findings.push(['WORK_STATUS', `${id} has invalid status ${status}.`]);
  else if (status === 'On UAT' && !/\brelease\s+`?[0-9a-f]{7,}/i.test(evidence))
    findings.push(['UAT_EVIDENCE', `${id} is On UAT but names no release (release <commit>).`]);
  else if (status === 'Done' && !/\bowner\b[^|]*\baccept/i.test(evidence))
    findings.push([
      'OWNER_ACCEPTANCE',
      `${id} cannot be Done without the owner's recorded acceptance.`,
    ]);
  else if (status === 'Replaced' && !/\breplaced by\s+\S/i.test(evidence))
    findings.push([
      'REPLACEMENT_POINTER',
      `${id} is Replaced but does not say what replaces it ("Replaced by …").`,
    ]);
  return findings;
}
