/**
 * WI-OI-120m: the discovery journey's recorder. It watches every page a persona uses and, at each step, records what a
 * careful tester would notice: the calls the screen made (the data flow), failed or slow calls, console and page
 * errors, technical messages shown to people, raw ids and enum codes on screen, controls hidden under other elements,
 * horizontal overflow, unlabelled controls and an axe accessibility scan. Findings and screenshots go to a board.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type FindingKind = 'BLOCKER' | 'BUG' | 'DATA FLOW' | 'UX' | 'LAYOUT' | 'ACCESSIBILITY';

export interface Finding {
  readonly kind: FindingKind;
  readonly stage: string;
  readonly step: string;
  readonly persona: string;
  readonly title: string;
  readonly detail: string;
  readonly url: string;
}

export interface Call {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly ms: number;
  message: string;
}

/**
 * Answers a screen expects and explains in its own words, so they are not defects: each with the reason. A refusal not
 * listed here is a finding.
 */
const EXPECTED: ReadonlyArray<{ status: number; path: RegExp; message: RegExp; why: string }> = [
  { status: 404, path: /\/configuration\/runtime\/manifest\/current$/, message: /No active runtime configuration/, why: 'Settings shows "No active configured tenant fields" for a new workspace' },
  { status: 404, path: /\/organization\/trees\/[^/]+\/active$/, message: /No version of this tree was active/, why: 'Structure shows "No version is in force yet" with the next steps' },
  { status: 403, path: /\/workforce\/punches$/, message: /not linked to a Workforce person/, why: 'My clock explains the person is not linked and who can link them' },
];
const expected = (call: Call) => EXPECTED.some((entry) => entry.status === call.status && entry.path.test(call.path.split('?')[0]!) && entry.message.test(call.message));

export interface StepRecord {
  readonly stage: string;
  readonly step: string;
  readonly persona: string;
  readonly outcome: 'DONE' | 'BLOCKED' | 'PARTIAL';
  readonly note: string;
  readonly url: string;
  readonly calls: readonly Call[];
  readonly screenshot: string;
  readonly seconds: number;
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const ENUM_CODE = /\b[A-Z][A-Z0-9]{1,}(?:_[A-Z0-9]+)+\b/g;
const TECHNICAL = /Unsupported [A-Za-z &]+ route|Internal server error|Unexpected token|is not defined|Cannot read propert|ECONNREFUSED|\bstatusCode\b|\{"(message|error|code)"|\bnull\b|\bundefined\b|\[object Object\]|NaN/;

/** The recorder for one journey run. */
export class JourneyRecorder {
  readonly findings: Finding[] = [];
  readonly steps: StepRecord[] = [];
  private stage = 'Start';
  private step = 'Start';
  private readonly calls = new Map<Page, Call[]>();
  private readonly personas = new Map<Page, string>();
  private readonly seen = new Set<string>();
  private readonly refusalsExpected: Array<{ page: Page; method: string; path: RegExp }> = [];
  private shot = 0;

  constructor(
    private readonly out: string,
    readonly run: string,
    private readonly testInfo?: TestInfo,
  ) {
    mkdirSync(join(out, 'shots'), { recursive: true });
  }

  /** Watches a persona's page: its API calls, console errors and page errors. */
  attach(page: Page, persona: string): void {
    this.personas.set(page, persona);
    this.calls.set(page, []);
    const started = new Map<string, number>();
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) started.set(request.url() + request.method(), Date.now());
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith('/api/')) return;
      const key = response.url() + response.request().method();
      const ms = Date.now() - (started.get(key) ?? Date.now());
      const status = response.status();
      // Recorded at once, so a step checking for refused saves sees it; the server's message is added when it arrives.
      const call: Call = { method: response.request().method(), path: url.pathname + url.search, status, ms, message: '' };
      this.calls.get(page)?.push(call);
      if (status >= 400) {
        response
          .text()
          .then((text) => {
            call.message = messageOf(text);
          })
          .catch(() => undefined);
      }
    });
    page.on('console', (message) => {
      // The browser logs every refused request on its own; those are judged from the calls above, not twice here.
      if (message.type() === 'error' && !/^Failed to load resource/.test(message.text())) this.add('BUG', `Console error`, message.text().slice(0, 300), page);
    });
    page.on('pageerror', (error) => this.add('BUG', 'Page error (the screen crashed or threw)', error.message.slice(0, 300), page));
  }

  /** A refusal this step provokes on purpose (a wrong role trying an action); it is checked, not reported as a defect. */
  expectRefusal(page: Page, method: string, path: RegExp): void {
    this.refusalsExpected.push({ page, method, path });
  }

  /** Writes (POST, PUT, PATCH, DELETE) the server refused in this step so far: a refused save is never a done step. */
  failedWrites(page: Page): Call[] {
    return (this.calls.get(page) ?? []).filter((call) => call.method !== 'GET' && call.status >= 400);
  }

  /** Records a finding once per stage, title and detail. */
  add(kind: FindingKind, title: string, detail: string, page?: Page): void {
    const key = `${kind}|${this.stage}|${title}|${detail}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.findings.push({ kind, stage: this.stage, step: this.step, persona: page ? (this.personas.get(page) ?? '') : '', title, detail, url: page ? safePath(page) : '' });
  }

  /**
   * Runs one step of the journey as a persona. A failure is recorded as a blocker and the journey carries on; the
   * step's calls, the page audit and a screenshot are kept either way. Answers whether the step completed.
   */
  async do(stage: string, step: string, page: Page, action: () => Promise<string | void>): Promise<boolean> {
    this.stage = stage;
    this.step = step;
    this.calls.set(page, []);
    const started = Date.now();
    let outcome: StepRecord['outcome'] = 'DONE';
    let note = '';
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The step did not finish within 3 minutes (the screen stopped responding to the journey)')), 180000);
      });
      note = (await Promise.race([action(), limit]).finally(() => clearTimeout(timer))) ?? '';
      if (note.startsWith('PARTIAL:')) {
        outcome = 'PARTIAL';
        note = note.slice(8).trim();
      }
    } catch (error) {
      outcome = 'BLOCKED';
      note = (error instanceof Error ? error.message : String(error)).split('\n').slice(0, 3).join(' ').slice(0, 400);
      this.add('BLOCKER', `Could not complete: ${step}`, note, page);
    }
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    const calls = [...(this.calls.get(page) ?? [])];
    for (const call of calls) {
      if (expected(call)) continue;
      const provoked = this.refusalsExpected.findIndex((entry) => entry.page === page && entry.method === call.method && entry.path.test(call.path.split('?')[0]!));
      if (provoked >= 0 && call.status >= 400) {
        this.refusalsExpected.splice(provoked, 1);
        continue;
      }
      if (call.status >= 500) this.add('BUG', `Server error ${call.status} on ${call.method} ${stripIds(call.path)}`, call.message, page);
      else if (call.status >= 400 && call.status !== 401) this.add('BUG', `Refused ${call.status} on ${call.method} ${stripIds(call.path)}`, call.message, page);
      if (call.ms > 3000) this.add('UX', `Slow call (${(call.ms / 1000).toFixed(1)} s) on ${call.method} ${stripIds(call.path)}`, '', page);
    }
    await this.audit(page);
    const screenshot = await this.screenshot(page, `${stage} ${step}`);
    this.steps.push({ stage, step, persona: this.personas.get(page) ?? '', outcome, note, url: safePath(page), calls, screenshot, seconds: Math.round((Date.now() - started) / 100) / 10 });
    return outcome !== 'BLOCKED';
  }

  /** What a careful tester notices on the page as it stands. */
  async audit(page: Page): Promise<void> {
    const found = await page
      .evaluate(
        ({ uuid, enumCode, technical }) => {
          const visible = (element: Element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const text: string[] = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const parent = node.parentElement;
            if (!parent || !visible(parent) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
            const value = node.textContent?.trim();
            if (value) text.push(value);
          }
          const options = [...document.querySelectorAll('select option')].map((option) => option.textContent?.trim() ?? '');
          const rawIds = [...new Set(text.filter((value) => new RegExp(uuid, 'i').test(value)).map((value) => value.slice(0, 120)))].slice(0, 5);
          const codes = [...new Set([...text, ...options].flatMap((value) => value.match(new RegExp(enumCode, 'g')) ?? []))].filter((code) => !/^(HTTP|API|URL|UTC|ISO|USD|EUR|GBP|INR|PDF|CSV|SKU|SSO|MFA|ID)$/.test(code)).slice(0, 12);
          const messages = [...new Set(text.filter((value) => new RegExp(technical).test(value) && value.length < 300))].slice(0, 5);
          const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          const covered: string[] = [];
          for (const element of document.querySelectorAll('button, a[href], input, select, textarea')) {
            if (!visible(element)) continue;
            const box = element.getBoundingClientRect();
            if (box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth) continue;
            const x = box.left + box.width / 2;
            const y = box.top + box.height / 2;
            const top = document.elementFromPoint(x, y);
            if (top && top !== element && !element.contains(top) && !top.contains(element)) {
              const name = (element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || element.tagName).trim().slice(0, 40);
              const over = (top.closest('button, a, [role]')?.textContent || top.textContent || top.tagName).trim().slice(0, 40);
              covered.push(`"${name}" is covered by "${over}"`);
            }
          }
          const unlabeled: string[] = [];
          for (const element of document.querySelectorAll('input:not([type=hidden]), select, textarea, button')) {
            if (!visible(element)) continue;
            const labelled =
              element.getAttribute('aria-label') ||
              element.getAttribute('aria-labelledby') ||
              (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) ||
              element.closest('label') ||
              (element.tagName === 'BUTTON' && element.textContent?.trim()) ||
              element.getAttribute('title');
            if (!labelled) unlabeled.push(`${element.tagName.toLowerCase()}${element.getAttribute('placeholder') ? ` "${element.getAttribute('placeholder')}"` : ''}`);
          }
          const emptyTables = [...document.querySelectorAll('table')].filter((table) => visible(table) && table.querySelectorAll('tbody tr').length === 0 && !(table.parentElement?.textContent ?? '').match(/no |nothing|empty|create|add/i)).length;
          return { rawIds, codes, messages, overflow, covered: [...new Set(covered)].slice(0, 6), unlabeled: [...new Set(unlabeled)].slice(0, 8), emptyTables };
        },
        { uuid: UUID.source, enumCode: ENUM_CODE.source, technical: TECHNICAL.source },
      )
      .catch(() => null);
    if (!found) return;
    if (found.rawIds.length) this.add('UX', 'Raw id shown to people', found.rawIds.join(' | '), page);
    if (found.codes.length) this.add('UX', 'Internal codes shown instead of words', found.codes.join(', '), page);
    if (found.messages.length) this.add('UX', 'Technical message shown to people', found.messages.join(' | '), page);
    if (found.overflow) this.add('LAYOUT', 'The page scrolls sideways at this width', `${page.viewportSize()?.width ?? '?'} px wide`, page);
    for (const covered of found.covered) this.add('LAYOUT', 'A control is covered by another element', covered, page);
    if (found.unlabeled.length) this.add('ACCESSIBILITY', 'Controls without a label', found.unlabeled.join(', '), page);
    if (found.emptyTables) this.add('UX', 'An empty table with no guidance', `${found.emptyTables} table(s)`, page);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze().catch(() => null);
    for (const violation of axe?.violations ?? []) {
      if (violation.impact !== 'serious' && violation.impact !== 'critical') continue;
      this.add('ACCESSIBILITY', `${violation.help} (${violation.impact})`, `${violation.id}: ${violation.nodes.length} element(s), e.g. ${violation.nodes[0]?.target.join(' ') ?? ''}`, page);
    }
  }

  async screenshot(page: Page, label: string): Promise<string> {
    this.shot += 1;
    const file = `shots/${String(this.shot).padStart(3, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60)}.png`;
    await page.screenshot({ path: join(this.out, file), fullPage: true, timeout: 15000 }).catch(() => undefined);
    return file;
  }

  /** Writes findings.json and the board (index.html). */
  write(context: Record<string, string>): void {
    writeFileSync(join(this.out, 'findings.json'), JSON.stringify({ ...context, run: this.run, findings: this.findings, steps: this.steps }, null, 2));
    writeFileSync(join(this.out, 'index.html'), board(this.findings, this.steps, { ...context, run: this.run }));
    if (this.testInfo) void this.testInfo.attach('journey findings', { path: join(this.out, 'index.html'), contentType: 'text/html' });
  }
}

function messageOf(text: string): string {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const nested = body.message && typeof body.message === 'object' ? (body.message as Record<string, unknown>) : body;
    return String(nested.message ?? body.detail ?? body.title ?? body.error ?? '').slice(0, 300);
  } catch {
    return text.slice(0, 200);
  }
}

const stripIds = (path: string) => path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}').replace(/\?.*$/, '');
const safePath = (page: Page) => {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return '';
  }
};

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function board(findings: readonly Finding[], steps: readonly StepRecord[], context: Record<string, string>): string {
  const kinds: FindingKind[] = ['BLOCKER', 'BUG', 'DATA FLOW', 'UX', 'LAYOUT', 'ACCESSIBILITY'];
  const counts = kinds.map((kind) => `<span class="pill k-${kind.replace(' ', '-')}">${kind} ${findings.filter((f) => f.kind === kind).length}</span>`).join(' ');
  const stages = [...new Set(steps.map((s) => s.stage))];
  const sections = stages
    .map((stage) => {
      const stageSteps = steps.filter((s) => s.stage === stage);
      const stageFindings = findings.filter((f) => f.stage === stage);
      const stepRows = stageSteps
        .map(
          (s) => `<div class="step">
  <div class="head"><span class="pill o-${s.outcome}">${s.outcome}</span> <strong>${escape(s.step)}</strong> <span class="muted">as ${escape(s.persona)} · ${escape(s.url)} · ${s.seconds} s</span></div>
  ${s.note ? `<p class="note">${escape(s.note)}</p>` : ''}
  <details><summary>${s.calls.length} calls (data flow)</summary><table>${s.calls.map((c) => `<tr class="${c.status >= 400 ? 'bad' : ''}"><td>${c.method}</td><td>${escape(stripIds(c.path))}</td><td>${c.status}</td><td>${c.ms} ms</td><td>${escape(c.message)}</td></tr>`).join('')}</table></details>
  <a href="${escape(s.screenshot)}" target="_blank"><img src="${escape(s.screenshot)}" alt="" loading="lazy"></a>
</div>`,
        )
        .join('\n');
      const findingRows = stageFindings
        .map((f) => `<li><span class="pill k-${f.kind.replace(' ', '-')}">${f.kind}</span> <strong>${escape(f.title)}</strong> <span class="muted">(${escape(f.step)}, ${escape(f.persona)}, ${escape(f.url)})</span>${f.detail ? `<div class="detail">${escape(f.detail)}</div>` : ''}</li>`)
        .join('');
      return `<section><h2>${escape(stage)}</h2>${findingRows ? `<ul class="findings">${findingRows}</ul>` : '<p class="muted">No findings.</p>'}${stepRows}</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Journey findings</title>
<style>
:root{--bg:#f7f7f8;--fg:#18181b;--muted:#71717a;--line:#e4e4e7;--card:#fff;--bad:#b91c1c;--warn:#a16207;--info:#1d4ed8;--good:#15803d;--violet:#6d28d9}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f11;--fg:#f4f4f5;--muted:#a1a1aa;--line:#27272a;--card:#18181b;--bad:#f87171;--warn:#facc15;--info:#60a5fa;--good:#4ade80;--violet:#a78bfa}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}main{max-width:1200px;margin:0 auto;padding:16px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:14px 0}h1{font-size:20px}h2{font-size:16px;margin:4px 0 8px}
.muted{color:var(--muted)}.pill{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:0 8px;font-size:12px;font-weight:600}
.k-BLOCKER,.o-BLOCKED{color:var(--bad)}.k-BUG{color:var(--bad)}.k-DATA-FLOW{color:var(--violet)}.k-UX{color:var(--warn)}.k-LAYOUT{color:var(--info)}.k-ACCESSIBILITY{color:var(--info)}.o-DONE{color:var(--good)}.o-PARTIAL{color:var(--warn)}
.findings{padding-left:18px}.findings li{margin:6px 0}.detail{color:var(--muted);font-size:13px;word-break:break-word}
.step{border-top:1px solid var(--line);padding:10px 0}.note{margin:6px 0;color:var(--muted)}img{max-width:100%;max-height:260px;border:1px solid var(--line);border-radius:6px;margin-top:6px}
table{border-collapse:collapse;font-size:12px;width:100%}td{border-bottom:1px solid var(--line);padding:3px 6px;word-break:break-all}tr.bad td{color:var(--bad)}
@media (max-width:640px){main{padding:12px}}
</style></head><body><main>
<h1>Tenant-to-value journey: findings</h1>
<p class="muted">Run ${escape(context.run ?? '')} · ${escape(context.origin ?? '')} · workspace ${escape(context.workspace ?? '')} · ${escape(context.when ?? '')}</p>
<p>${counts}</p>
${sections}
</main></body></html>`;
}
