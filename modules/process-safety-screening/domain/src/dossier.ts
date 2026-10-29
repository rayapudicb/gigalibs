import type {
  SpeedCriteriaSetV1,
  SpeedLibrarySetV1,
  SpeedResultV1,
  SpeedRouteDetailV1,
  SpeedStepV1,
} from '@gigalibs/contracts';
import {
  type GateResult,
  type GreenOutcome,
  type InteractionResult,
  type OxygenBalanceResult,
  type ScreeningAction,
  type Stage2Test,
  type StepScreening,
  type ThermalOutcome,
  actionList,
  interactionFindingKey,
  stage2Plan,
} from '@gigalibs/process-safety-engines';
import { type Translate, speedText } from './messages/index.js';
import { engineCriteria, engineLibrary } from './sets.js';

// WI-OI-120ca (SPEED S7; screen spec §2.4 panel speed.dossier-preview; FR-RPT-01 to 05): the dossier as one model, with
// every text resolved from the catalogue. The API renders DOCX and PDF from it, the panel previews it and the JSON
// export carries it, so the three never disagree. It reads only the stored results and the sets they name.

export type DossierBlock =
  | { readonly kind: 'paragraph'; readonly text: string; readonly emphasis?: 'statement' }
  | {
      readonly kind: 'tiles';
      readonly items: readonly { readonly label: string; readonly value: string }[];
    }
  | {
      readonly kind: 'table';
      readonly columns: readonly string[];
      readonly rows: readonly (readonly string[])[];
      /** Per row, the level of an action table (for the colour that accompanies the text). */
      readonly levels?: readonly ('CRITICAL' | 'REVIEW' | 'DATA_GAP')[];
    };

export interface DossierSection {
  readonly key:
    | 'summary'
    | 'route'
    | 'thermal'
    | 'interactions'
    | 'actions'
    | 'stage2'
    | 'basis'
    | 'signatures';
  readonly title: string;
  readonly blocks: readonly DossierBlock[];
}

export interface DossierModelV1 {
  readonly modelVersion: 1;
  readonly title: string;
  readonly subtitle: string;
  readonly generated: string;
  /** The text on every page until the route is approved (R2); null once approved. */
  readonly watermark: string | null;
  readonly sections: readonly DossierSection[];
  /** WI-OI-120cc (S9b): the summary's numbers as data, for the business outcomes; absent in dossiers made before. */
  readonly facts?: DossierFactsV1;
}

export interface DossierFactsV1 {
  readonly steps: number;
  readonly stepsPassingGate: number;
  readonly worstClass: number | null;
  readonly criticalActions: number;
  /** Actions before kilo-lab by level (FR-RPT-02): the summary's totals. */
  readonly reviewActions: number;
  readonly dataGaps: number;
  readonly routePmi: number | null;
  readonly atomEconomyPercent: number | null;
  readonly overallYieldPercent: number | null;
}

export interface DossierInput {
  readonly route: SpeedRouteDetailV1;
  readonly criteria: SpeedCriteriaSetV1 | null;
  readonly library: SpeedLibrarySetV1 | null;
  readonly generatedAt: string;
  readonly locale?: string;
  /** Approval is R2 (S10, S11); until then every dossier is a draft. */
  readonly approved?: boolean;
}

type Output = Readonly<Record<string, unknown>>;
const outputsOf = (result: SpeedResultV1 | null): Output => result?.outputs ?? {};
const number = (value: unknown, digits: number): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits, useGrouping: false })
    : '—';

/** A step's results as `actionList` and `stage2Plan` read them; null when the step has no gate result to read. */
function screeningOf(step: SpeedStepV1): StepScreening | null {
  const outputs = outputsOf(step.latestResult);
  const gate = outputs['gate'] as GateResult | undefined;
  if (gate?.status !== 'OK') return null;
  const thermal = outputs['thermal'] as (ThermalOutcome & { reason?: unknown }) | undefined;
  const interactions = outputs['interactions'] as
    | (InteractionResult & { reason?: unknown })
    | undefined;
  return {
    stepId: step.id,
    gate,
    oxygenBalance: (outputs['oxygenBalance'] as StepScreening['oxygenBalance'] | undefined) ?? [],
    // Without a library in force the thermal and interaction screens are not computed; that is its own route action.
    thermal: thermal && !thermal.reason ? thermal : { status: 'LOCKED' },
    interactions:
      interactions && interactions.status === 'OK'
        ? interactions
        : {
            status: 'OK',
            findings: [],
            notes: [],
            unclassifiedMaterialIds: [],
            usesUnreviewedLibrary: false,
            libraryVersion: '',
          },
  };
}

/**
 * A material's name in a step; a substance charged twice in one step (water as reagent and as quench) is told apart by
 * its role. Shared by the dossier and the screens (WI-OI-120cc).
 */
export function materialLabel(step: SpeedStepV1, materialId: string, t: Translate): string {
  const found = step.materials.find((m) => m.id === materialId);
  if (!found) return materialId;
  const twice = step.materials.some(
    (m) => m.id !== found.id && m.substanceId === found.substanceId,
  );
  return twice ? `${found.substanceName} (${t(`speed.role.${found.role}`)})` : found.substanceName;
}

export function dossierModel(input: DossierInput): DossierModelV1 {
  const t = speedText(input.locale ?? 'en-US');
  const { route } = input;
  const steps = route.steps;
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const material = (id: unknown) => {
    for (const step of steps)
      if (step.materials.some((m) => m.id === id)) return materialLabel(step, String(id), t);
    return String(id ?? '');
  };
  const rules = new Map((input.library?.library.rules ?? []).map((rule) => [rule.id, rule]));
  const gases = new Map(
    Object.values(input.library?.library.gases ?? {}).map((gas) => [gas.id, gas.name ?? gas.id]),
  );
  const ruleText = (ruleId: unknown) => rules.get(String(ruleId))?.finding ?? String(ruleId ?? '');

  // Actions before kilo-lab and the Stage 2 plan, from S7a's engine functions over the stored results.
  const screenings = steps.map(screeningOf);
  const decisions = {
    documentedControls: new Set(
      steps.flatMap((step) =>
        step.controls.map((control) => interactionFindingKey(step.id, control)),
      ),
    ),
    acceptedMitigations: new Set(
      steps.filter((step) => step.mitigation?.acceptedBy).map((step) => step.id),
    ),
  };
  const computed = screenings.filter((screening): screening is StepScreening => screening !== null);
  const actions: (
    | ScreeningAction
    | { level: 'DATA_GAP'; stepId: null; code: string; requirement: string; params?: undefined }
  )[] =
    input.criteria && input.library
      ? actionList(
          computed,
          decisions,
          engineLibrary(input.library),
          engineCriteria(input.criteria),
        )
      : [];
  if (!input.criteria)
    actions.push({
      level: 'DATA_GAP',
      stepId: null,
      code: 'SPEED_NO_CRITERIA_IN_FORCE',
      requirement: 'BRD-15',
    });
  if (!input.library)
    actions.push({
      level: 'DATA_GAP',
      stepId: null,
      code: 'SPEED_NO_LIBRARY_IN_FORCE',
      requirement: 'BRD-16.2',
    });
  const tests = stage2Plan(computed);

  const actionText = (action: (typeof actions)[number]): string => {
    const p = action.params ?? {};
    switch (action.code) {
      case 'ACTION_OB_HIGH':
        return t(action.code, { material: material(p['materialId']) });
      case 'ACTION_OB_REVIEW':
        return t(`ACTION_OB_REVIEW.${String(p['basis'])}`, {
          material: material(p['materialId']),
          percent: number(p['percent'], 1),
        });
      case 'ACTION_STOESSEL_CRITICAL': {
        const mitigation = action.stepId
          ? (stepById.get(action.stepId)?.mitigation?.text ?? '')
          : '';
        return t(`ACTION_STOESSEL_CRITICAL.${String(p['mitigationAccepted'])}`, {
          k: String(p['stoesselClass']),
          mitigation,
        });
      }
      case 'ACTION_INTERACTION_HIGH':
        return t(`ACTION_INTERACTION_HIGH.${String(p['controlDocumented'])}`, {
          a: material(p['materialAId']),
          b: material(p['materialBId']),
          finding: ruleText(p['ruleId']),
        });
      case 'ACTION_INTERACTION_MEDIUM':
        return t(action.code, {
          a: material(p['materialAId']),
          b: material(p['materialBId']),
          finding: ruleText(p['ruleId']),
        });
      case 'ACTION_THERMAL_NOT_COMPUTED':
        return t(action.code, { reason: t(String(p['reasonCode'])) });
      case 'ACTION_GAS_EVOLUTION':
        return t(action.code, {
          gas: gases.get(String(p['gasId'])) ?? String(p['gasId']),
          moles: number(p['moles'], 2),
          litres: number(p['litresAtStp'], 1),
        });
      default:
        return t(action.code, p as Record<string, string | number | readonly string[]>);
    }
  };
  const stepLabel = (stepId: string | null) =>
    stepId ? String(stepById.get(stepId)?.position ?? '') : '—';
  const targetText = (test: Stage2Test): string => {
    const target = test.target;
    if (target.kind === 'MATERIAL')
      return t('stage2.target.MATERIAL', { material: material(target.materialId) });
    if (target.kind === 'MATERIAL_PAIR')
      return t('stage2.target.MATERIAL_PAIR', {
        a: material(target.materialAId),
        b: material(target.materialBId),
      });
    return t(`stage2.target.${target.kind}`);
  };
  const reasonText = (test: Stage2Test): string => {
    const p = test.reason.params ?? {};
    if (test.reason.code === 'STAGE2_INTERACTION_RULE')
      return t(test.reason.code, { finding: ruleText(p['ruleId']) });
    if (test.reason.code === 'STAGE2_GAS_RELEASED')
      return t(test.reason.code, { moles: number(p['moles'], 2) });
    return t(test.reason.code, p as Record<string, string | number | readonly string[]>);
  };

  const thermalOf = (step: SpeedStepV1) => {
    const thermal = outputsOf(step.latestResult)['thermal'] as ThermalOutcome | undefined;
    return thermal?.status === 'OK' ? thermal : null;
  };
  const classes = steps.flatMap((step) => {
    const thermal = thermalOf(step);
    return thermal
      ? [thermal.stoesselClass, thermal.stoesselClassFullAccumulation].filter(
          (value): value is NonNullable<typeof value> => value !== null,
        )
      : [];
  });
  const worst = classes.length > 0 ? String(Math.max(...classes)) : '—';
  const rollup = route.rollup as {
    status?: string;
    processMassIntensity?: number;
    atomEconomyPercent?: number;
    overallYieldPercent?: number;
  } | null;
  const green =
    rollup?.status === 'OK'
      ? `${number(rollup.processMassIntensity, 2)} · ${number(rollup.atomEconomyPercent, 1)} % · ${number(rollup.overallYieldPercent, 1)} %`
      : '—';
  const count = (level: string) => actions.filter((action) => action.level === level).length;

  const equation = (step: SpeedStepV1) => {
    const term = (m: SpeedStepV1['materials'][number]) =>
      `${m.coefficient !== null && m.coefficient !== 1 ? `${m.coefficient} ` : ''}${m.formula}`;
    const left = step.materials
      .filter((m) => m.role === 'Reactant')
      .map(term)
      .join(' + ');
    const right = step.materials
      .filter((m) => m.role === 'Product' || m.role === 'By-product')
      .map(term)
      .join(' + ');
    return left || right ? `${left} → ${right}` : '—';
  };
  const gateText = (step: SpeedStepV1) => {
    const gate = outputsOf(step.latestResult)['gate'] as
      | {
          status?: string;
          pass?: boolean;
          issues?: { code: string; params?: Record<string, string | number | readonly string[]> }[];
          reason?: { code: string };
        }
      | undefined;
    if (gate?.status !== 'OK')
      return gate?.reason ? t(gate.reason.code) : t('speed.gate.notComputed');
    if (gate.pass) return t('speed.gate.passedShort');
    return t('speed.gate.blockedShort', {
      issues: (gate.issues ?? []).map((issue) => t(issue.code, issue.params)).join(' '),
    });
  };

  const interactionRows = steps.flatMap((step) => {
    const screen = outputsOf(step.latestResult)['interactions'] as InteractionResult | undefined;
    if (screen?.status !== 'OK') return [];
    return [...screen.findings]
      .sort(
        (a, b) =>
          ({ High: 3, Medium: 2, Low: 1 })[b.severity] - { High: 3, Medium: 2, Low: 1 }[a.severity],
      )
      .map((finding) => {
        const control = step.controls.find(
          (c) => c.materialAId === finding.materialAId && c.materialBId === finding.materialBId,
        );
        return [
          String(step.position),
          t(`speed.severity.${finding.severity}`),
          t('speed.haz.pair', {
            a: material(finding.materialAId),
            b: material(finding.materialBId),
          }),
          `${finding.ruleId}: ${ruleText(finding.ruleId)}`,
          finding.citation,
          control ? control.text : finding.severity === 'High' ? t('speed.haz.notDocumented') : '—',
        ];
      });
  });

  const review = (reviewed: boolean | null) =>
    t(reviewed ? 'speed.result.reviewed' : 'speed.result.unreviewed');
  const firstResult =
    steps.map((step) => step.latestResult).find((result) => result !== null) ?? null;
  const basisRows: string[][] = [
    [t('speed.dossier.basis.engine'), firstResult?.engineVersion ?? '—'],
    [
      t('speed.dossier.basis.criteria'),
      input.criteria
        ? t('speed.dossier.versionStatus', {
            version: input.criteria.versionLabel,
            status: review(input.criteria.reviewStatus === 'APPROVED'),
          })
        : '—',
    ],
    [
      t('speed.dossier.basis.library'),
      input.library
        ? t('speed.dossier.versionStatus', {
            version: input.library.versionLabel,
            status: review(input.library.reviewStatus === 'APPROVED'),
          })
        : '—',
    ],
    [t('speed.dossier.basis.elements'), firstResult?.elementsVersion ?? '—'],
    ...steps.map((step) => [
      t('speed.dossier.basis.inputs', { position: step.position }),
      step.latestResult?.inputsHash ?? '—',
    ]),
    ...Object.entries(input.criteria?.citations ?? {}).map(([key, citation]) => [
      t('speed.dossier.basis.citation', { key }),
      citation,
    ]),
  ];

  const sections: DossierSection[] = [
    {
      key: 'summary',
      title: t('speed.dossier.section.summary'),
      blocks: [
        {
          kind: 'tiles',
          items: [
            {
              label: t('speed.dossier.steps'),
              value: `${route.stepsPassingGate}/${route.stepCount}`,
            },
            { label: t('speed.dossier.worstClass'), value: worst },
            { label: t('speed.dossier.criticalActions'), value: String(count('CRITICAL')) },
            { label: t('speed.dossier.green'), value: green },
          ],
        },
        {
          kind: 'paragraph',
          text: t('speed.dossier.actionTotals', {
            critical: count('CRITICAL'),
            review: count('REVIEW'),
            gaps: count('DATA_GAP'),
          }),
        },
      ],
    },
    {
      key: 'route',
      title: t('speed.dossier.section.route'),
      blocks: [
        {
          kind: 'table',
          columns: [
            t('speed.dossier.step'),
            t('speed.dossier.name'),
            t('speed.dossier.equation'),
            t('speed.dossier.gate'),
          ],
          rows: steps.map((step) => [
            String(step.position),
            step.name,
            equation(step),
            gateText(step),
          ]),
        },
      ],
    },
    {
      key: 'thermal',
      title: t('speed.dossier.section.thermal'),
      blocks: [
        {
          kind: 'table',
          columns: [
            t('speed.dossier.step'),
            t('speed.dossier.name'),
            t('speed.thermal.dtad'),
            t('speed.thermal.mtsrColumn'),
            t('speed.thermal.td24'),
            t('speed.thermal.td24Source'),
            t('speed.thermal.class'),
          ],
          rows: steps.map((step) => {
            const thermal = thermalOf(step);
            return [
              String(step.position),
              step.name,
              number(thermal?.adiabaticRiseK, 1),
              number(thermal?.mtsrC, 1),
              number(thermal?.td24C, 1),
              thermal
                ? t(`td24.${thermal.td24Basis}`, {
                    offset: input.criteria?.criteria.td24ConservativeOnsetOffsetK ?? '',
                  })
                : '—',
              thermal
                ? `${thermal.stoesselClass ?? '—'} / ${thermal.stoesselClassFullAccumulation ?? '—'}`
                : '—',
            ];
          }),
        },
      ],
    },
    {
      key: 'interactions',
      title: t('speed.dossier.section.interactions'),
      blocks: [
        interactionRows.length > 0
          ? {
              kind: 'table',
              columns: [
                t('speed.dossier.step'),
                t('speed.library.severity'),
                t('speed.library.label'),
                t('speed.dossier.findings'),
                t('speed.library.citation'),
                t('speed.dossier.control'),
              ],
              rows: interactionRows,
            }
          : { kind: 'paragraph', text: t('speed.dossier.noFindings') },
        {
          kind: 'paragraph',
          text: `${t('speed.haz.statement')} ${t('speed.haz.statementDetail')}`,
          emphasis: 'statement',
        },
      ],
    },
    {
      key: 'actions',
      title: t('speed.dossier.section.actions'),
      blocks: [
        actions.length > 0
          ? {
              kind: 'table',
              columns: [
                t('speed.dossier.level'),
                t('speed.dossier.step'),
                t('speed.dossier.message'),
                t('speed.dossier.rule'),
              ],
              rows: actions.map((action) => [
                t(`speed.level.${action.level}`),
                stepLabel(action.stepId),
                actionText(action),
                action.requirement,
              ]),
              levels: actions.map((action) => action.level),
            }
          : { kind: 'paragraph', text: t('speed.dossier.noActions') },
      ],
    },
    {
      key: 'stage2',
      title: t('speed.dossier.section.stage2'),
      blocks: [
        tests.length > 0
          ? {
              kind: 'table',
              columns: [
                t('speed.dossier.step'),
                t('speed.dossier.target'),
                t('speed.dossier.test'),
                t('speed.dossier.why'),
              ],
              rows: tests.map((test) => [
                stepLabel(test.stepId),
                targetText(test),
                t(`stage2.test.${test.test}`),
                reasonText(test),
              ]),
            }
          : { kind: 'paragraph', text: t('speed.dossier.noTests') },
      ],
    },
    {
      key: 'basis',
      title: t('speed.dossier.section.basis'),
      blocks: [
        {
          kind: 'table',
          columns: [t('speed.dossier.item'), t('speed.dossier.value')],
          rows: basisRows,
        },
      ],
    },
    {
      key: 'signatures',
      title: t('speed.dossier.section.signatures'),
      blocks: [
        {
          kind: 'table',
          columns: [
            t('speed.dossier.signatureName'),
            t('speed.dossier.signatureRole'),
            t('speed.dossier.signatureMeaning'),
            t('speed.dossier.signatureTime'),
          ],
          rows: [],
        },
        { kind: 'paragraph', text: t('speed.dossier.notSigned') },
      ],
    },
  ];

  return {
    modelVersion: 1,
    title: t('speed.dossier.title'),
    subtitle: t('speed.dossier.subtitle', { route: route.name, version: route.routeVersion }),
    generated: t('speed.dossier.generated', {
      time: input.generatedAt.replace('T', ' ').slice(0, 19),
    }),
    watermark: input.approved ? null : t('speed.dossier.watermark'),
    sections,
    facts: {
      steps: route.stepCount,
      stepsPassingGate: route.stepsPassingGate,
      worstClass: classes.length > 0 ? Math.max(...classes) : null,
      criticalActions: count('CRITICAL'),
      reviewActions: count('REVIEW'),
      dataGaps: count('DATA_GAP'),
      routePmi: rollup?.status === 'OK' ? finite(rollup.processMassIntensity) : null,
      atomEconomyPercent: rollup?.status === 'OK' ? finite(rollup.atomEconomyPercent) : null,
      overallYieldPercent: rollup?.status === 'OK' ? finite(rollup.overallYieldPercent) : null,
    },
  };
}

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** The route's materials step by step with their results, as CSV (RFC 4180): the data a lab imports elsewhere. */
export function routeCsv(route: SpeedRouteDetailV1, t: Translate = speedText()): string {
  const quote = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  // Names are typed by people: one that a spreadsheet would read as a formula is kept as text (OWASP CSV injection).
  const text = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
  const header = [
    t('speed.dossier.step'),
    t('speed.dossier.name'),
    t('speed.materials.role'),
    t('speed.materials.substance'),
    t('speed.materials.formula'),
    t('speed.materials.coefficient'),
    t('speed.materials.mass'),
    t('speed.materials.molarMass'),
    t('speed.ob.percent'),
    t('speed.ob.recommendation'),
  ];
  const rows = route.steps.flatMap((step) => {
    const ob =
      (outputsOf(step.latestResult)['oxygenBalance'] as
        | { materialId: string; result: OxygenBalanceResult | { status: string } }[]
        | undefined) ?? [];
    return step.materials.map((m) => {
      const result = ob.find((entry) => entry.materialId === m.id)?.result;
      const ok =
        result && result.status === 'OK'
          ? (result as Extract<OxygenBalanceResult, { status: 'OK' }>)
          : null;
      return [
        String(step.position),
        text(step.name),
        t(`speed.role.${m.role}`),
        text(m.substanceName),
        m.formula,
        m.coefficient === null ? '' : String(m.coefficient),
        m.massG === null ? '' : String(m.massG),
        String(m.molarMassGPerMol),
        ok ? number(ok.percent, 2) : '',
        ok ? t(`speed.recommendation.${ok.recommendation}`) : '',
      ];
    });
  });
  return `${[header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;
}

export type { GreenOutcome };
