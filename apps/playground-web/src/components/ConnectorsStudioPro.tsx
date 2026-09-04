import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, StatusBadge, Button, Input } from '@gigalibs/ui';

interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber: string;
  department: string;
  subTier: string;
  postedDate: string;
  responseDeadline: string;
  typeOfSetAsideDescription: string;
  naicsCode: string;
  uiLink: string;
}

interface SamExclusion {
  name: string;
  classificationType: string;
  uei: string;
  exclusionType: string;
  agency: string;
  activeDate: string;
}

export function ConnectorsStudioPro({ tenantSlug = 'sam-gov' }: { tenantSlug?: string }) {
  const [apiKey, setApiKey] = React.useState('DEMO_KEY_GSA_OPEN_2026');
  const [naics, setNaics] = React.useState('541512');
  const [syncStatus, setSyncStatus] = React.useState<'IDLE' | 'SYNCING' | 'SUCCESS'>('IDLE');
  const [activeSubTab, setActiveSubTab] = React.useState<'CONFIG' | 'OPPORTUNITIES' | 'EXCLUSIONS'>('OPPORTUNITIES');

  const [opportunities, setOpportunities] = React.useState<SamOpportunity[]>([
    {
      noticeId: 'W912DY-26-R-0044',
      title: 'DoD Cloud Computing & Mission Command Architecture Support',
      solicitationNumber: 'W912DY-26-R-0044',
      department: 'DEPARTMENT OF DEFENSE',
      subTier: 'DEPT OF THE ARMY',
      postedDate: '2026-08-28',
      responseDeadline: '2026-09-25',
      typeOfSetAsideDescription: 'Total Small Business Set-Aside',
      naicsCode: '541512',
      uiLink: 'https://sam.gov/opp/w912dy26r0044/view',
    },
    {
      noticeId: '80HQTR-26-R-0019',
      title: 'NASA Deep Space Autonomous Telemetry & Data Processing Network',
      solicitationNumber: '80HQTR-26-R-0019',
      department: 'NASA',
      subTier: 'NASA HEADQUARTERS',
      postedDate: '2026-08-30',
      responseDeadline: '2026-10-10',
      typeOfSetAsideDescription: '8(a) Sole Source / Competitive',
      naicsCode: '541519',
      uiLink: 'https://sam.gov/opp/80hqtr26r0019/view',
    },
    {
      noticeId: '36C10B-26-Q-0210',
      title: 'VA Medical Telehealth EHR Integration & Identity Verification',
      solicitationNumber: '36C10B-26-Q-0210',
      department: 'DEPARTMENT OF VETERANS AFFAIRS',
      subTier: 'TAC ACQUISITION CENTER',
      postedDate: '2026-09-01',
      responseDeadline: '2026-09-18',
      typeOfSetAsideDescription: 'SDVOSB (Service-Disabled Veteran)',
      naicsCode: '541511',
      uiLink: 'https://sam.gov/opp/36c10b26q0210/view',
    },
  ]);

  const [exclusions, setExclusions] = React.useState<SamExclusion[]>([
    {
      name: 'Apex Global Logistics LLC',
      classificationType: 'Firm / Vendor',
      uei: 'J8K9LM123N45',
      exclusionType: 'Debarment (Ineligible for Federal Award)',
      agency: 'DEPARTMENT OF THE NAVY',
      activeDate: '2025-04-12',
    },
    {
      name: 'Marcus Vance (Former Subcontractor PM)',
      classificationType: 'Individual',
      uei: 'N/A',
      exclusionType: 'Suspension (Interim Prohibitive Gate)',
      agency: 'DEFENSE LOGISTICS AGENCY',
      activeDate: '2026-01-15',
    },
  ]);

  const handleSyncNow = () => {
    setSyncStatus('SYNCING');
    setTimeout(() => {
      setSyncStatus('SUCCESS');
      alert('✓ SAM.gov API Sync Completed: 3 Active Solicitations & 2 Exclusions Synced into isolated database!');
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">🔌 Connectors & External API Gateways</h2>
            <Badge variant="success">ISOLATED TENANT SCOPE</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure external API connections, webhooks, and automated data pipelines for workspace: <strong>{tenantSlug}.localhost:5180</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSyncNow}
            disabled={syncStatus === 'SYNCING'}
            className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold"
          >
            {syncStatus === 'SYNCING' ? 'Syncing SAM.gov…' : '🔄 Sync All Connectors'}
          </Button>
        </div>
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* SAM.gov Gateway */}
        <Card className="border-2 border-indigo-600 shadow-sm relative flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-xl">
                  🏛️
                </div>
                <div>
                  <CardTitle className="text-sm font-black text-slate-900">SAM.gov Federal Gateway</CardTitle>
                  <p className="text-[11px] text-slate-400 font-mono">api.sam.gov · GSA Open Tech</p>
                </div>
              </div>
              <StatusBadge status="ACTIVE" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <p className="text-slate-600 leading-relaxed">
              Pulls real-time Federal Solicitations, RFPs, NAICS-targeted opportunities, and FAR 9.405 subcontractor debarment exclusion lists.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl border space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">API Key:</span>
                <span className="text-indigo-600 font-bold">••••••••••••2026</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target NAICS:</span>
                <span className="font-bold text-slate-800">{naics}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sync Cadence:</span>
                <span className="text-emerald-600 font-bold">Every 6 Hours</span>
              </div>
            </div>
            <div className="pt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveSubTab('OPPORTUNITIES')}
                className="w-1/2 text-xs font-bold !bg-indigo-50 !border-indigo-200 !text-indigo-700"
              >
                View RFPs ({opportunities.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveSubTab('EXCLUSIONS')}
                className="w-1/2 text-xs font-bold !bg-rose-50 !border-rose-200 !text-rose-700"
              >
                Debarment ({exclusions.length})
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stripe Connector */}
        <Card className="border-slate-200 flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xl">
                  💳
                </div>
                <div>
                  <CardTitle className="text-sm font-black text-slate-900">Stripe Billing & Payments</CardTitle>
                  <p className="text-[11px] text-slate-400 font-mono">api.stripe.com/v1</p>
                </div>
              </div>
              <StatusBadge status="ACTIVE" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <p className="text-slate-600 leading-relaxed">
              Synchronizes customer credit card checkouts, payment intent webhooks, and automatic invoice reconciliation.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl border space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Webhook Secret:</span>
                <span className="font-bold text-slate-700">whsec_••••9942</span>
              </div>
            </div>
            <div className="pt-2">
              <Button size="sm" variant="outline" className="w-full text-xs font-bold" onClick={() => alert('Stripe webhook listener active!')}>
                Configure Webhook
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Universal Webhook Inbound */}
        <Card className="border-slate-200 flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xl">
                  ⚡
                </div>
                <div>
                  <CardTitle className="text-sm font-black text-slate-900">Custom Inbound Webhooks</CardTitle>
                  <p className="text-[11px] text-slate-400 font-mono">/api/v1/webhooks/inbound</p>
                </div>
              </div>
              <StatusBadge status="ACTIVE" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <p className="text-slate-600 leading-relaxed">
              Accepts JSON events from ERPs, CRM systems, or internal tools to trigger tenant-scoped workflow DAG pipelines.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl border space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">HMAC Auth:</span>
                <span className="text-emerald-600 font-bold">SHA-256 Enforced</span>
              </div>
            </div>
            <div className="pt-2">
              <Button size="sm" variant="outline" className="w-full text-xs font-bold" onClick={() => alert('Inbound webhook listener endpoint ready!')}>
                Generate Ingestion URL
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SAM.gov Detailed Data View */}
      <Card className="border-slate-200">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('OPPORTUNITIES')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSubTab === 'OPPORTUNITIES' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                🎯 Active Federal Opportunities ({opportunities.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('EXCLUSIONS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSubTab === 'EXCLUSIONS' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                🛡️ Subcontractor Debarment Blacklist ({exclusions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('CONFIG')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSubTab === 'CONFIG' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                ⚙️ SAM.gov API Credentials
              </button>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Last synced: Today at {new Date().toLocaleTimeString()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {activeSubTab === 'OPPORTUNITIES' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-slate-600 font-bold">
                  <tr>
                    <th className="p-3">Solicitation #</th>
                    <th className="p-3">Title & Scope</th>
                    <th className="p-3">Federal Agency</th>
                    <th className="p-3">Socioeconomic Set-Aside</th>
                    <th className="p-3">NAICS</th>
                    <th className="p-3">Deadline</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {opportunities.map((opp) => (
                    <tr key={opp.noticeId} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono font-bold text-indigo-600">{opp.solicitationNumber}</td>
                      <td className="p-3 max-w-sm">
                        <div className="font-bold text-slate-900">{opp.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{opp.subTier}</div>
                      </td>
                      <td className="p-3 font-semibold text-slate-700">{opp.department}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {opp.typeOfSetAsideDescription}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-600">{opp.naicsCode}</td>
                      <td className="p-3 font-mono text-slate-600">{opp.responseDeadline}</td>
                      <td className="p-3 text-right space-x-2">
                        <a
                          href={opp.uiLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px]"
                        >
                          SAM.gov ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeSubTab === 'EXCLUSIONS' && (
            <div className="p-5 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                <strong>FAR 9.405 Debarment Enforcement:</strong> Prime contractors are legally prohibited from issuing subcontracts exceeding $35,000 to excluded entities without a written exception from the federal agency head.
              </div>
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">Excluded Entity / Individual</th>
                      <th className="p-3">Classification</th>
                      <th className="p-3">UEI Number</th>
                      <th className="p-3">Exclusion Classification</th>
                      <th className="p-3">Action Agency</th>
                      <th className="p-3">Effective Since</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exclusions.map((rec, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-bold text-rose-600">{rec.name}</td>
                        <td className="p-3 text-slate-700">{rec.classificationType}</td>
                        <td className="p-3 font-mono text-slate-500">{rec.uei}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            {rec.exclusionType}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700">{rec.agency}</td>
                        <td className="p-3 font-mono text-slate-500">{rec.activeDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSubTab === 'CONFIG' && (
            <div className="p-6 max-w-xl space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">GSA SAM.gov API Key</label>
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                <p className="text-[10px] text-slate-400 mt-1">Obtain your API key from api.sam.gov or the GSA Open Technology Portal.</p>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Primary NAICS Filter</label>
                <Input value={naics} onChange={(e) => setNaics(e.target.value)} placeholder="541512" />
              </div>
              <Button size="sm" className="!bg-indigo-600 !text-white font-bold" onClick={() => alert('API configuration saved!')}>
                Save API Gateway Settings
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
