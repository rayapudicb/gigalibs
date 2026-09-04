import * as React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  StatusBadge,
  Input,
  Button,
  Modal,
} from '@gigalibs/ui';
import {
  UniversalRuleEngine,
  type UniversalRule,
  type RuleEvaluationResult,
  type RuleAction,
  type ConditionLeaf,
  type StandardOperator,
  type RuleTriggerType,
  type RuleActionCategory,
} from '@gigalibs/rule-engine-universal';
import { ApiClient } from '../api-client.js';

// ─── MASTER INDUSTRY RULE PRESETS ─────────────────────────────────────────────

export const MASTER_RULE_PRESETS: Array<{
  rule: UniversalRule;
  defaultFact: Record<string, any>;
  description: string;
}> = [
  {
    rule: {
      id: 'rule_film_pyro_interlock',
      name: '🎬 Film Soundstage Stunt & Pyrotechnic Risk Interlock',
      category: '🎬 Media & Film Production',
      triggerType: 'FORM_SUBMISSION',
      priority: 100,
      description: 'Automatically locks soundstage telematics and dispatches emergency alerts when high-voltage stunts or explosives are reported.',
      conditions: {
        all: [
          { fact: 'form.hasPyrotechnics', operator: 'equal', value: 'YES' },
          { fact: 'form.riggingRiskScore', operator: 'greaterThanInclusive', value: 4 },
        ],
      },
      guards: {
        requiresPriorEventId: 'form.safetyMarshal',
        idempotencyKey: 'pyro_lock_${form.projectName}',
      },
      actions: [
        {
          id: 'act_1',
          type: 'COMMUNICATION_SLACK',
          target: '#production-safety-alerts',
          description: 'Post high-priority emergency alert in Slack with GPS pin.',
          params: { channel: '#production-safety-alerts', severity: 'CRITICAL' },
        },
        {
          id: 'act_2',
          type: 'COMMUNICATION_SMS',
          target: '+1-310-555-0199 (Lead Fire Marshal)',
          description: 'Dispatch immediate SMS to Onsite Fire Marshal.',
          params: { message: 'URGENT: Pyrotechnic stunt reported on Stage 4. Verify LAFD permit #.' },
        },
        {
          id: 'act_3',
          type: 'STATE_MUTATION',
          target: 'soundstage_telematics_lock',
          description: 'Engage electronic soundstage access lock until permit verified.',
          params: { lockState: 'ENGAGED', restrictedZone: 'STAGE_4' },
        },
      ],
      isActive: true,
    },
    defaultFact: {
      form: {
        projectName: 'Project Neon Phoenix (Day 4/28)',
        safetyMarshal: 'Johnathan Vance (Badge #4812)',
        hasPyrotechnics: 'YES',
        riggingRiskScore: 5,
        location: 'Soundstage 4 - Hollywood Hills',
      },
    },
    description: 'Triggered when daily safety audit reports pyrotechnics with risk score >= 4.',
  },
  {
    rule: {
      id: 'rule_ar_dunning_escalation',
      name: '💰 High-Value Overdue AR Dunning & Late Surcharge Escalation',
      category: '💰 Finance & Billing',
      triggerType: 'INVOICE_EVENT',
      priority: 90,
      description: 'Applies automated 2.5% late penalty surcharge and triggers multi-channel dunning when balance exceeds $10,000.',
      conditions: {
        all: [
          { fact: 'invoice.daysOutstanding', operator: 'greaterThan', value: 30 },
          { fact: 'invoice.balanceDue', operator: 'greaterThanInclusive', value: 10000 },
          { fact: 'invoice.status', operator: 'notEqual', value: 'PAID' },
        ],
      },
      guards: {
        requiresPriorEventId: 'invoice.id',
        idempotencyKey: 'dunning_fee_${invoice.id}',
      },
      actions: [
        {
          id: 'act_ar_1',
          type: 'LEDGER_COMMIT',
          target: 'GENERAL_LEDGER',
          description: 'Debit Accounts Receivable (1200) / Credit Late Fee Revenue (4200) for 2.5% penalty.',
          params: { penaltyRate: 0.025, accountDebit: '1200', accountCredit: '4200' },
        },
        {
          id: 'act_ar_2',
          type: 'COMMUNICATION_SMS',
          target: '+1-415-555-0842 (VP of Finance)',
          description: 'Dispatch overdue SMS notice with 1-click payment link.',
          params: { template: 'DUNNING_URGENT_TIER_2' },
        },
        {
          id: 'act_ar_3',
          type: 'COMMUNICATION_SLACK',
          target: '#finance-collections',
          description: 'Notify collections team on Slack.',
          params: { channel: '#finance-collections' },
        },
      ],
      isActive: true,
    },
    defaultFact: {
      invoice: {
        id: 'INV-2026-9812',
        clientName: 'Paramount Global Studios',
        balanceDue: 28500,
        daysOutstanding: 45,
        status: 'OVERDUE',
      },
    },
    description: 'Triggered when an invoice is outstanding > 30 days and balance >= $10,000.',
  },
  {
    rule: {
      id: 'rule_osha_crane_wind_shutdown',
      name: '🏗️ OSHA Heavy Crane High-Wind Shutdown Emergency Interlock',
      category: '🏗️ Construction & Heavy Rigging',
      triggerType: 'IOT_SENSOR',
      priority: 100,
      description: 'Halts crane telematics and sounds jobsite alarm when anemometers detect wind speed >= 30 MPH.',
      conditions: {
        all: [
          { fact: 'sensor.windSpeedMph', operator: 'greaterThanInclusive', value: 30 },
          { fact: 'crane.isOperational', operator: 'equal', value: true },
        ],
      },
      guards: {
        requiresPriorEventId: 'crane.telematicsConnected',
        idempotencyKey: 'crane_wind_halt_${sensor.jobSiteId}',
      },
      actions: [
        {
          id: 'act_crane_1',
          type: 'STATE_MUTATION',
          target: 'crane_hoist_telematics',
          description: 'Emergency stop: disable crane boom and hoist motor power.',
          params: { command: 'EMERGENCY_HALT_MOTOR' },
        },
        {
          id: 'act_crane_2',
          type: 'COMMUNICATION_SMS',
          target: 'ALL_RIGGING_CREW (+1-212-555-0100)',
          description: 'Broadcast high-wind evacuation SMS to all onsite operators.',
          params: { severity: 'EMERGENCY_WEATHER' },
        },
      ],
      isActive: true,
    },
    defaultFact: {
      sensor: {
        jobSiteId: 'MANHATTAN_TOWER_3',
        windSpeedMph: 34.5,
        gustSpeedMph: 42.0,
      },
      crane: {
        craneId: 'LIEBHERR_LR_1300',
        isOperational: true,
        telematicsConnected: true,
      },
    },
    description: 'Triggered when anemometer sensor reports wind speed >= 30 MPH.',
  },
  {
    rule: {
      id: 'rule_security_geovelocity_lock',
      name: '🛡️ Zero-Trust Security & IP Geovelocity Account Lockout',
      category: '🛡️ Security & Zero-Trust',
      triggerType: 'USER_EVENT',
      priority: 95,
      description: 'Freezes user session and triggers 2FA challenge when login occurs from an unexpected country or after 5 failed attempts.',
      conditions: {
        any: [
          { fact: 'user.failedAttempts', operator: 'greaterThanInclusive', value: 5 },
          { fact: 'auth.isGeovelocityAnomaly', operator: 'equal', value: true },
        ],
      },
      guards: {
        requiresPriorEventId: 'auth.attemptId',
      },
      actions: [
        {
          id: 'act_sec_1',
          type: 'STATE_MUTATION',
          target: 'user_session_registry',
          description: 'Revoke active JWT bearer tokens and require hardware TOTP challenge.',
          params: { action: 'FORCE_MFA_CHALLENGE' },
        },
        {
          id: 'act_sec_2',
          type: 'COMMUNICATION_SLACK',
          target: '#secops-audit-log',
          description: 'Dispatch audit log to Security Operations team.',
          params: { channel: '#secops-audit-log', riskScore: 'HIGH' },
        },
      ],
      isActive: true,
    },
    defaultFact: {
      user: {
        email: 'devin.vance@gigalibs.dev',
        failedAttempts: 6,
        homeCountry: 'US',
      },
      auth: {
        attemptId: 'auth_attempt_9912',
        requestCountry: 'RO',
        isGeovelocityAnomaly: true,
      },
    },
    description: 'Triggered when failed logins >= 5 or impossible geovelocity detected.',
  },
  {
    rule: {
      id: 'rule_cron_midnight_recharge',
      name: '🕒 Midnight Tier Credit Auto-Recharge Cron',
      category: '🕒 Scheduled Cron Automation',
      triggerType: 'CRON_SCHEDULE',
      cronExpression: '0 0 * * *',
      priority: 50,
      description: 'Runs every night at midnight to check API credit balances and auto-recharge enterprise accounts.',
      conditions: {
        all: [
          { fact: 'tenant.balanceCredits', operator: 'lessThan', value: 500 },
          { fact: 'tenant.autoRechargeEnabled', operator: 'equal', value: true },
        ],
      },
      guards: {
        idempotencyKey: 'cron_recharge_${tenant.id}_${today}',
      },
      actions: [
        {
          id: 'act_cron_1',
          type: 'WEBHOOK_OUTBOUND',
          target: 'https://api.stripe.com/v1/payment_intents',
          description: 'Execute automated $500 payment intent charge via Stripe.',
          params: { amountCents: 50000, currency: 'USD' },
        },
        {
          id: 'act_cron_2',
          type: 'LEDGER_COMMIT',
          target: 'GENERAL_LEDGER',
          description: 'Debit Cash (1000) / Credit Deferred SaaS Revenue (2100).',
          params: { amount: 500, accountDebit: '1000', accountCredit: '2100' },
        },
      ],
      isActive: true,
    },
    defaultFact: {
      tenant: {
        id: 'acme_corp',
        name: 'Acme Corporation Enterprise',
        balanceCredits: 320,
        autoRechargeEnabled: true,
      },
      today: '2026-08-31',
    },
    description: 'Runs daily at 00:00 UTC to evaluate credit balance and trigger billing.',
  },
];

export function UniversalRuleStudioPro() {
  const [activeStudioTab, setActiveStudioTab] = React.useState<'SIMULATOR' | 'DESIGNER' | 'GUARDS' | 'CRON' | 'INTEGRATIONS'>('DESIGNER');
  const [selectedPresetIndex, setSelectedPresetIndex] = React.useState<number>(0);
  const [currentRule, setCurrentRule] = React.useState<UniversalRule>(MASTER_RULE_PRESETS[0]!.rule);
  const [designerViewMode, setDesignerViewMode] = React.useState<'VISUAL_BLOCKS' | 'RAW_JSON'>('VISUAL_BLOCKS');
  const [factJsonInput, setFactJsonInput] = React.useState<string>(
    JSON.stringify(MASTER_RULE_PRESETS[0]!.defaultFact, null, 2)
  );
  const [evaluationResults, setEvaluationResults] = React.useState<RuleEvaluationResult[] | null>(null);
  const [dbRules, setDbRules] = React.useState<any[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  // Initialize engine with all rules
  const engine = React.useMemo(() => {
    const eng = new UniversalRuleEngine();
    eng.addRules(MASTER_RULE_PRESETS.map((p) => p.rule));
    return eng;
  }, []);

  React.useEffect(() => {
    ApiClient.listRules()
      .then((rules) => {
        setDbRules(rules);
        if (rules && rules.length > 0) {
          rules.forEach((r: any) => {
            try {
              engine.addRules([{
                id: r.id,
                name: r.name,
                category: '🏛️ Custom DB Rules',
                triggerType: 'USER_EVENT',
                priority: 100,
                description: r.description || '',
                conditions: r.conditionAst,
                actions: Array.isArray(r.actionPayload) ? r.actionPayload : [r.actionPayload],
                isActive: r.isActive,
              }]);
            } catch {}
          });
        }
      })
      .catch(() => {});
  }, [engine]);

  // Handle Preset Switching
  const handleSelectPreset = (idx: number) => {
    setSelectedPresetIndex(idx);
    const preset = MASTER_RULE_PRESETS[idx];
    if (!preset) return;
    setCurrentRule(preset.rule);
    setFactJsonInput(JSON.stringify(preset.defaultFact, null, 2));
    setEvaluationResults(null);
  };

  // Run Rule Evaluation
  const handleEvaluateRules = () => {
    try {
      const parsedFacts = JSON.parse(factJsonInput);
      const results = engine.evaluate(parsedFacts);
      setEvaluationResults(results);
    } catch (err: any) {
      alert(`Invalid JSON Fact Format: ${err.message}`);
    }
  };

  // Save Rule to DB
  const handleSaveCurrentRuleToDb = async () => {
    setIsSaving(true);
    try {
      await ApiClient.saveRule({
        name: currentRule.name,
        description: currentRule.description,
        conditionAst: currentRule.conditions,
        actionPayload: currentRule.actions,
        isActive: currentRule.isActive,
      });
      const updated = await ApiClient.listRules();
      setDbRules(updated);
      alert(`Rule "${currentRule.name}" successfully saved to PostgreSQL database!`);
    } catch (err: any) {
      alert(`Failed to save rule: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── VISUAL NO-CODE BLOCK MUTATIONS ──────────────────────────────────────────

  // Extract condition leaves from current rule
  const getConditionLeaves = (): ConditionLeaf[] => {
    if ('all' in currentRule.conditions && Array.isArray(currentRule.conditions.all)) {
      return currentRule.conditions.all.filter((c): c is ConditionLeaf => 'fact' in c);
    }
    if ('any' in currentRule.conditions && Array.isArray(currentRule.conditions.any)) {
      return currentRule.conditions.any.filter((c): c is ConditionLeaf => 'fact' in c);
    }
    if ('fact' in currentRule.conditions) {
      return [currentRule.conditions as ConditionLeaf];
    }
    return [];
  };

  // Add Condition Block to Visual Rule
  const handleAddVisualCondition = () => {
    const newLeaf: ConditionLeaf = {
      fact: 'form.riskScore',
      operator: 'greaterThanInclusive',
      value: 4,
    };

    setCurrentRule((prev) => {
      const isAny = 'any' in prev.conditions;
      const existing = getConditionLeaves();
      return {
        ...prev,
        conditions: isAny ? { any: [...existing, newLeaf] } : { all: [...existing, newLeaf] },
      };
    });
  };

  // Update Specific Condition Leaf
  const handleUpdateConditionLeaf = (index: number, key: keyof ConditionLeaf, val: any) => {
    setCurrentRule((prev) => {
      const isAny = 'any' in prev.conditions;
      const leaves = [...getConditionLeaves()];
      if (!leaves[index]) return prev;
      leaves[index] = { ...leaves[index], [key]: val };
      return {
        ...prev,
        conditions: isAny ? { any: leaves } : { all: leaves },
      };
    });
  };

  // Delete Condition Leaf
  const handleDeleteConditionLeaf = (index: number) => {
    const leaves = getConditionLeaves();
    if (leaves.length <= 1) {
      alert('A rule must contain at least 1 condition.');
      return;
    }
    setCurrentRule((prev) => {
      const isAny = 'any' in prev.conditions;
      const updated = leaves.filter((_, i) => i !== index);
      return {
        ...prev,
        conditions: isAny ? { any: updated } : { all: updated },
      };
    });
  };

  // Add Action Block to Visual Rule
  const handleAddVisualAction = () => {
    const newAction: RuleAction = {
      id: `act_${Date.now()}`,
      type: 'COMMUNICATION_SLACK',
      target: '#general-alerts',
      description: 'Send notification alert to team channel.',
      params: { severity: 'INFO' },
    };

    setCurrentRule((prev) => ({
      ...prev,
      actions: [...prev.actions, newAction],
    }));
  };

  // Delete Action Block
  const handleDeleteVisualAction = (actionId?: string) => {
    if (currentRule.actions.length <= 1) {
      alert('A rule must contain at least 1 automated action.');
      return;
    }
    setCurrentRule((prev) => ({
      ...prev,
      actions: prev.actions.filter((a) => a.id !== actionId),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>⚡ Universal Business Rule Engine (Visual No-Code + AST)</span>
            <Badge variant="info">Drools & Zapier Grade</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            Non-coders build visual English logic blocks, while the engine executes clean, lightning-fast <strong>Boolean AST JSON trees</strong> with state guards.
          </p>
        </div>

        {/* Master Tab Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border">
          {[
            { id: 'DESIGNER', label: '🎨 Visual No-Code Designer' },
            { id: 'SIMULATOR', label: '🚀 Live Fact Simulator' },
            { id: 'GUARDS', label: '🛡️ State Guards & Idempotency' },
            { id: 'CRON', label: '🕒 Cron Recurring Scheduler' },
            { id: 'INTEGRATIONS', label: '🔌 Outbound Integrations' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveStudioTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeStudioTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Selector Banner */}
      <div className="p-3 bg-slate-900 text-white rounded-2xl flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-indigo-300">🌐 1-Click Industry Rule Preset:</span>
          <select
            value={selectedPresetIndex}
            onChange={(e) => handleSelectPreset(Number(e.target.value))}
            className="h-8 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold text-xs"
          >
            {MASTER_RULE_PRESETS.map((p, idx) => (
              <option key={p.rule.id} value={idx}>
                [{p.rule.category?.split(' ')[1]}] {p.rule.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setActiveStudioTab('SIMULATOR')}>
            Test in Live Simulator 🚀
          </Button>
        </div>
      </div>

      {/* ─── TAB 1: VISUAL NO-CODE RULE DESIGNER ─────────────────────────────────── */}
      {activeStudioTab === 'DESIGNER' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6 shadow-sm">
          {/* Header & View Mode Switcher */}
          <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">{currentRule.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{currentRule.description}</p>
            </div>
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border">
              <button
                onClick={() => setDesignerViewMode('VISUAL_BLOCKS')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  designerViewMode === 'VISUAL_BLOCKS'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🎨 Visual Blocks (Non-Coder)
              </button>
              <button
                onClick={() => setDesignerViewMode('RAW_JSON')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  designerViewMode === 'RAW_JSON'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                💻 Raw JSON AST
              </button>
            </div>
          </div>

          {designerViewMode === 'VISUAL_BLOCKS' ? (
            <div className="space-y-6 text-xs">
              {/* BLOCK 1: TRIGGER EVENT */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold bg-indigo-600 text-white px-2 py-0.5 rounded">STEP 1</span>
                  <span className="font-bold text-slate-800 text-xs">WHEN THIS EVENT HAPPENS ⚡</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Trigger Event Source</label>
                    <select
                      value={currentRule.triggerType || 'FORM_SUBMISSION'}
                      onChange={(e) => setCurrentRule({ ...currentRule, triggerType: e.target.value as RuleTriggerType })}
                      className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
                    >
                      <option value="FORM_SUBMISSION">📝 Form Submission (Safety, Intake, Timesheet)</option>
                      <option value="INVOICE_EVENT">💰 Invoice Event (Overdue, Payment, Created)</option>
                      <option value="IOT_SENSOR">📡 IoT Telematics / Sensor (Wind, Temp, GPS)</option>
                      <option value="USER_EVENT">🛡️ User Security Event (Failed Login, Auth)</option>
                      <option value="CRON_SCHEDULE">🕒 Scheduled Recurring Cron (Midnight, Hourly)</option>
                      <option value="WEBHOOK">🌐 External HTTP Webhook (Stripe, GitHub, Twilio)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Execution Priority</label>
                    <Input
                      type="number"
                      value={currentRule.priority ?? 100}
                      onChange={(e) => setCurrentRule({ ...currentRule, priority: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              {/* BLOCK 2: IF CONDITIONS MATCH */}
              <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-200 space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold bg-indigo-600 text-white px-2 py-0.5 rounded">STEP 2</span>
                    <span className="font-bold text-indigo-950 text-xs">IF THESE CONDITIONS ARE MET 🔍</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-800">Match Logic:</span>
                    <select
                      value={'any' in currentRule.conditions ? 'ANY' : 'ALL'}
                      onChange={(e) => {
                        const isAny = e.target.value === 'ANY';
                        const leaves = getConditionLeaves();
                        setCurrentRule({
                          ...currentRule,
                          conditions: isAny ? { any: leaves } : { all: leaves },
                        });
                      }}
                      className="h-7 px-2 rounded-lg border border-indigo-300 bg-white text-[11px] font-bold text-indigo-900"
                    >
                      <option value="ALL">AND (All conditions must match)</option>
                      <option value="ANY">OR (Any condition can match)</option>
                    </select>
                  </div>
                </div>

                {/* Visual Condition Rows */}
                <div className="space-y-2 pt-1">
                  {getConditionLeaves().map((leaf, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-3 bg-white rounded-xl border border-indigo-200 flex flex-wrap items-center gap-2 shadow-xs"
                    >
                      <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                        #{cIdx + 1}
                      </span>
                      {/* Fact Field */}
                      <input
                        type="text"
                        value={leaf.fact}
                        onChange={(e) => handleUpdateConditionLeaf(cIdx, 'fact', e.target.value)}
                        placeholder="Field / Fact (e.g. form.riskScore)"
                        className="flex-1 min-w-36 h-8 px-2.5 rounded-lg border border-slate-300 font-mono text-xs font-bold text-slate-800"
                      />
                      {/* Operator */}
                      <select
                        value={leaf.operator}
                        onChange={(e) => handleUpdateConditionLeaf(cIdx, 'operator', e.target.value)}
                        className="h-8 px-2 rounded-lg border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                      >
                        <option value="equal">is equal to (==)</option>
                        <option value="notEqual">is NOT equal to (!=)</option>
                        <option value="greaterThan">is greater than (&gt;)</option>
                        <option value="greaterThanInclusive">is greater or equal (&gt;=)</option>
                        <option value="lessThan">is less than (&lt;)</option>
                        <option value="lessThanInclusive">is less or equal (&lt;=)</option>
                        <option value="contains">contains text</option>
                        <option value="in">is in list</option>
                      </select>
                      {/* Value */}
                      <input
                        type="text"
                        value={String(leaf.value ?? '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsedVal = !isNaN(Number(val)) && val.trim() !== '' ? Number(val) : val;
                          handleUpdateConditionLeaf(cIdx, 'value', parsedVal);
                        }}
                        placeholder="Value (e.g. 4, YES)"
                        className="w-28 h-8 px-2.5 rounded-lg border border-slate-300 font-mono text-xs font-bold text-indigo-600"
                      />
                      <button
                        onClick={() => handleDeleteConditionLeaf(cIdx)}
                        className="text-slate-400 hover:text-rose-600 p-1 font-bold text-xs"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddVisualCondition}
                  className="!border-indigo-300 !text-indigo-700 !bg-white"
                >
                  + Add Condition Rule ➕
                </Button>
              </div>

              {/* BLOCK 3: STATE PRECONDITION GUARDS */}
              <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-200 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold bg-purple-600 text-white px-2 py-0.5 rounded">STEP 3</span>
                  <span className="font-bold text-purple-950 text-xs">
                    STATE-AWARE GUARD ("DO ONLY THIS IF DONE") 🛡️
                  </span>
                </div>
                <p className="text-[11px] text-purple-800">
                  Ensure this rule fires <strong>only once</strong> and only if prerequisite signatures or approvals are complete.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="font-bold text-purple-900 block mb-1">Prerequisite Prior Event / Signature</label>
                    <input
                      type="text"
                      value={currentRule.guards?.requiresPriorEventId || ''}
                      onChange={(e) =>
                        setCurrentRule({
                          ...currentRule,
                          guards: { ...currentRule.guards, requiresPriorEventId: e.target.value },
                        })
                      }
                      placeholder="e.g. form.safetyMarshal (Requires signature)"
                      className="w-full h-8 px-3 rounded-lg border border-purple-300 font-mono text-xs bg-white text-purple-950"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-purple-900 block mb-1">Idempotency Deduplication Key</label>
                    <input
                      type="text"
                      value={currentRule.guards?.idempotencyKey || ''}
                      onChange={(e) =>
                        setCurrentRule({
                          ...currentRule,
                          guards: { ...currentRule.guards, idempotencyKey: e.target.value },
                        })
                      }
                      placeholder="e.g. dunning_fee_${invoice.id}"
                      className="w-full h-8 px-3 rounded-lg border border-purple-300 font-mono text-xs bg-white text-purple-950"
                    />
                  </div>
                </div>
              </div>

              {/* BLOCK 4: AUTOMATED ACTIONS */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold bg-slate-900 text-white px-2 py-0.5 rounded">STEP 4</span>
                  <span className="font-bold text-slate-800 text-xs">THEN AUTOMATICALLY EXECUTE ACTIONS 🚀</span>
                </div>

                <div className="space-y-2 pt-1">
                  {currentRule.actions.map((act, aIdx) => (
                    <div
                      key={act.id || aIdx}
                      className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 shadow-xs"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                            Action #{aIdx + 1}
                          </span>
                          <select
                            value={act.type}
                            onChange={(e) => {
                              const updated = [...currentRule.actions];
                              updated[aIdx] = { ...act, type: e.target.value as RuleActionCategory };
                              setCurrentRule({ ...currentRule, actions: updated });
                            }}
                            className="h-7 px-2 rounded-lg border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                          >
                            <option value="COMMUNICATION_SLACK">💬 Send Slack Channel Alert</option>
                            <option value="COMMUNICATION_SMS">📱 Send Twilio Urgent SMS</option>
                            <option value="LEDGER_COMMIT">💰 Commit Double-Entry Ledger Journal</option>
                            <option value="STATE_MUTATION">🔒 Electronic State / Telematics Lock</option>
                            <option value="DAG_TRIGGER">⚡ Trigger GigaLibs Workflow DAG</option>
                            <option value="WEBHOOK_OUTBOUND">🌐 Dispatch HTTP Webhook POST</option>
                          </select>
                        </div>
                        <button
                          onClick={() => handleDeleteVisualAction(act.id)}
                          className="text-slate-400 hover:text-rose-600 font-bold p-1"
                        >
                          🗑️
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={act.target || ''}
                          onChange={(e) => {
                            const updated = [...currentRule.actions];
                            updated[aIdx] = { ...act, target: e.target.value };
                            setCurrentRule({ ...currentRule, actions: updated });
                          }}
                          placeholder="Target (e.g. #safety-alerts, +1-555-0199)"
                          className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-800"
                        />
                        <input
                          type="text"
                          value={act.description || ''}
                          onChange={(e) => {
                            const updated = [...currentRule.actions];
                            updated[aIdx] = { ...act, description: e.target.value };
                            setCurrentRule({ ...currentRule, actions: updated });
                          }}
                          placeholder="Action description..."
                          className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs text-slate-600"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddVisualAction}
                  className="!border-slate-300 !text-slate-800 !bg-white"
                >
                  + Add Automated Action ➕
                </Button>
              </div>
            </div>
          ) : (
            /* RAW JSON AST VIEW */
            <div className="space-y-3">
              <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl overflow-x-auto shadow-inner leading-relaxed">
                {JSON.stringify(currentRule, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      )}

      {/* ─── TAB 2: LIVE FACT SIMULATOR ─────────────────────────────────────────── */}
      {activeStudioTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: JSON Input Fact Payload */}
          <div className="lg:col-span-5 space-y-3">
            <Card className="p-4 space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                  📥 Input Event Fact Payload (JSON)
                </h4>
                <Badge variant="neutral">{currentRule.triggerType || 'EVENT'}</Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                Modify values below to simulate live events (e.g. change wind speed, invoice balance, or risk score).
              </p>
              <textarea
                rows={14}
                className="w-full p-3 font-mono text-xs bg-slate-950 text-emerald-400 rounded-xl border border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                value={factJsonInput}
                onChange={(e) => setFactJsonInput(e.target.value)}
              />
              <Button onClick={handleEvaluateRules} className="w-full !bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs">
                Evaluate Real-Time Facts 🚀
              </Button>
            </Card>
          </div>

          {/* Right: Evaluation Execution Results & Action Dispatcher */}
          <div className="lg:col-span-7 space-y-3">
            <Card className="p-4 space-y-4 min-h-[60vh]">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                  🎯 Rule Engine Runtime Execution Output
                </h4>
                {evaluationResults && (
                  <Badge variant={evaluationResults.some((r) => r.isMatched) ? 'success' : 'warning'}>
                    {evaluationResults.filter((r) => r.isMatched).length} Matched Rules
                  </Badge>
                )}
              </div>

              {evaluationResults ? (
                <div className="space-y-4">
                  {evaluationResults.map((res) => (
                    <div
                      key={res.ruleId}
                      className={`p-4 rounded-2xl border transition space-y-3 ${
                        res.isMatched
                          ? 'border-emerald-300 bg-emerald-50/50 shadow-sm'
                          : 'border-slate-200 bg-slate-50 opacity-70'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{res.isMatched ? '✅' : '⚪'}</span>
                          <span className="font-bold text-xs text-slate-900">{res.ruleName}</span>
                        </div>
                        <StatusBadge status={res.isMatched ? 'ACTIVE' : 'DRAFT'}>
                          {res.isMatched ? 'MATCHED' : 'UNMATCHED'}
                        </StatusBadge>
                      </div>

                      {/* State Guard Evaluation Feedback */}
                      {res.guardResult && (
                        <div className={`p-2.5 rounded-xl text-xs font-mono border ${
                          res.guardResult.satisfied
                            ? 'bg-emerald-100/60 border-emerald-300 text-emerald-900'
                            : 'bg-rose-100 border-rose-300 text-rose-900'
                        }`}>
                          <strong>🛡️ Guard Check:</strong> {res.guardResult.reason}
                        </div>
                      )}

                      {/* Dispatched Actions */}
                      {res.actionsToExecute.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-emerald-200">
                          <span className="text-[10px] font-mono uppercase font-bold text-emerald-800">
                            ⚡ Dispatched Actions ({res.actionsToExecute.length})
                          </span>
                          <div className="space-y-1.5">
                            {res.actionsToExecute.map((act, aIdx) => (
                              <div
                                key={aIdx}
                                className="p-2.5 bg-white rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between text-xs"
                              >
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-900 flex items-center gap-2">
                                    <span className="px-1.5 py-0.5 bg-slate-900 text-white rounded text-[10px] font-mono">
                                      {act.type}
                                    </span>
                                    <span>{act.target}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-500">{act.description}</div>
                                </div>
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                  ✓ SENT
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Audit Log */}
                      <details className="text-[10px] font-mono text-slate-500">
                        <summary className="cursor-pointer hover:underline">View Step-by-Step Audit Log</summary>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                          {res.auditLog.map((log, lIdx) => (
                            <li key={lIdx}>{log}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                  <div className="text-3xl">⚡</div>
                  <p>Click <strong>"Evaluate Real-Time Facts 🚀"</strong> to execute this fact payload against all 5 registered rules.</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 3: STATE GUARDS & IDEMPOTENCY MATRIX ───────────────────────────── */}
      {activeStudioTab === 'GUARDS' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-lg font-black text-slate-900">🛡️ State-Aware Guards & Idempotency Controls</h3>
            <p className="text-xs text-slate-500">
              Guards ensure actions execute <strong>only once</strong> and <strong>only after prerequisite events succeed</strong>.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-2xl border space-y-2">
              <span className="font-bold text-slate-900 block">1. Idempotency Deduplication</span>
              <p className="text-slate-600">
                Prevents double-charging credit cards or firing duplicate emergency SMS messages for the same event key.
              </p>
              <div className="font-mono text-[11px] p-2 bg-white rounded border">
                Locked Key Pattern: <code>pyro_lock_Project_Neon_Phoenix</code>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border space-y-2">
              <span className="font-bold text-slate-900 block">2. Prerequisite State Verification</span>
              <p className="text-slate-600">
                Ensures actions (like Ledger Commits or Stage Lockdowns) run only if preceding signatures or approvals are verified.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ─── TAB 4: CRON RECURRING SCHEDULER ─────────────────────────────────────── */}
      {activeStudioTab === 'CRON' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-lg font-black text-slate-900">🕒 Recurring Cron Job Engine</h3>
            <p className="text-xs text-slate-500 font-mono">
              Schedule rules to evaluate automatically on standard 5-field cron intervals (e.g. midnight reconciliation, 5-minute health checks).
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-2xl border space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900">Midnight SaaS Balance Auto-Recharge (`0 0 * * *`)</span>
                <Badge variant="success">Active Daemon</Badge>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value="0 0 * * * (Every night at 00:00 UTC)"
                  className="w-full h-9 px-3 font-mono text-xs bg-white border border-slate-300 rounded-xl font-bold text-indigo-600"
                />
                <Button size="sm" onClick={() => alert('Simulated cron trigger fired successfully!')}>
                  Test Trigger Now ⚡
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Next scheduled execution: <strong>Tomorrow at 00:00:00 UTC</strong>
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ─── TAB 5: OUTBOUND INTEGRATIONS ───────────────────────────────────────── */}
      {activeStudioTab === 'INTEGRATIONS' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-lg font-black text-slate-900">🔌 Outbound Communications & Multi-System Connectors</h3>
            <p className="text-xs text-slate-500">
              Configure credentials for Slack, Twilio, SendGrid, and GigaLibs DAG pipelines.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-2xl border space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900">1. Slack Webhook Alerts</span>
                <Badge variant="success">Connected</Badge>
              </div>
              <Input defaultValue="https://hooks.slack.com/services/T00/B00/alerts" />
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900">2. Twilio Emergency SMS Gateway</span>
                <Badge variant="info">Account SID Active</Badge>
              </div>
              <Input defaultValue="AC98124801824081204812" />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
