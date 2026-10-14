import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ownPerson, peopleList } from '../components/gigaops/TimeAndAttendance';
import { getKnowledgeEntry } from '../lib/module-knowledge-registry';

// WI-OI-120an (Security review of WI-OI-120ah, L1 and M1).
describe('Time & attendance screen', () => {
  const page = (items: number, total: number) => ({
    items: Array.from({ length: items }, () => ({})),
    total,
  });

  it('tells a loading people list from a complete, a cut-short and a failed one', () => {
    expect(peopleList(null, false)).toBe('loading');
    expect(peopleList(null, true)).toBe('unknown');
    expect(peopleList(page(3, 3), false)).toBe('complete');
    expect(peopleList(page(0, 0), false)).toBe('complete');
    expect(peopleList(page(100, 140), false)).toBe('unknown');
  });

  it("asks for the user's own punches and week only once they may have a person", () => {
    const session = { userId: 'user-1' };
    const linked = [{ platformUserId: 'someone-else' }, { platformUserId: 'user-1' }];
    const unlinked = [{ platformUserId: 'someone-else' }, { platformUserId: null }, {}];
    // Nothing is asked while the session or the list is still loading.
    expect(ownPerson(undefined, linked, 'complete')).toBe('wait');
    expect(ownPerson(session, [], 'loading')).toBe('wait');
    // A linked person: asked for.
    expect(ownPerson(session, linked, 'complete')).toBe('yes');
    expect(ownPerson(session, linked, 'unknown')).toBe('yes');
    // No person in the complete list: never asked, so never refused.
    expect(ownPerson(session, unlinked, 'complete')).toBe('no');
    // Cannot be known here: the server decides, as before.
    expect(ownPerson(session, unlinked, 'unknown')).toBe('ask');
    expect(ownPerson(null, unlinked, 'complete')).toBe('ask');
  });

  it('holds the clock and the week until then, and ignores a late answer', () => {
    const screen = readFileSync(
      join(__dirname, '../components/gigaops/TimeAndAttendance.tsx'),
      'utf8',
    );
    expect(screen).toMatch(/if \(!queueKey \|\| !mine\) return;/);
    expect(screen).toMatch(
      /const hold = resourceId === '' && \(own === 'wait' \|\| own === 'no'\);/,
    );
    expect(screen.match(/if \(request !== latest\.current\) return;/g)).toHaveLength(2);
    // Review L-1: a new choice clears the shown week, and no choice can change while a week is being submitted.
    expect(screen).toMatch(
      /id="sheet-person" value=\{resourceId\} disabled=\{busy\} onChange=\{\(event\) => \{ setPreview\(null\);/,
    );
    expect(screen).toMatch(
      /id="sheet-week" type="date" value=\{periodStart\} disabled=\{busy\}[^\n]*setPreview\(null\);/,
    );
    // Re-review: another day of the same week keeps the week shown, and the badge needs a loaded week.
    expect(screen).toMatch(/if \(next === periodStart\) return; setPreview\(null\);/);
    expect(screen).toMatch(/\{preview \? status \? <StatusBadge/);
    const workbench = readFileSync(
      join(__dirname, '../components/gigaops/GigaOpsWorkforceWorkbench.tsx'),
      'utf8',
    );
    expect(workbench).toMatch(/catch\(\(\) => setResourcesFailed\(true\)\)/);
    expect(workbench).toMatch(
      /<TimeAndAttendance resources=\{resources\?\.items \?\? \[\]\} list=\{peopleList\(resources, resourcesFailed\)\} \/>/,
    );
  });

  it('describes the real screen in its help and claims only what the server enforces', () => {
    const entry = getKnowledgeEntry('/gigaops/time');
    expect(entry.businessTitle).toBe('Time & Attendance');
    const text = [entry.summary, ...entry.actions, ...entry.guardrails].join('\n');
    for (const claim of [
      /cryptograph/i,
      /anti-tamper/i,
      /monotonic/i,
      /muster/i,
      /operator round/i,
      /work order/i,
      /signed at/i,
    ]) {
      expect(text).not.toMatch(claim);
    }
    expect(text).toMatch(/not tamper-proof/);
    // Review M-1: the site check runs only with a chosen site and a shared location; the help says what is not checked.
    expect(entry.actions[0]).toMatch(/when you pick a site and share your location/);
    expect(text).toMatch(
      /Not checked: punches with no site, and punches at a site with no boundary drawn/,
    );
    expect(text).not.toMatch(/each punch is checked/);
    expect(text).toMatch(/at a site with no location shared/);
    expect(text).toMatch(/nobody approves a week they submitted or their own/);
    // Review L-2: the server locks the punch's own week.
    expect(text).toMatch(
      /corrections are refused for punches dated in a submitted or approved week/,
    );
    expect(text).not.toMatch(/approvers\)|time managers\)/);
    // No internal port, schema or unproven standard.
    expect(entry.technicalSpec).toBeUndefined();
  });
});
