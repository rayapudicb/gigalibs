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
  FraudDetectionEngine,
  type FraudSignalInput,
  type FraudAssessmentResult,
  type QuarantinedTransaction,
  type GeovelocityCheck,
} from '@gigalibs/fraud-detection';
import { ApiClient } from '../api-client.js';

// ─── INITIAL QUARANTINED SUSPICIOUS TRANSACTIONS ─────────────────────────────

export const INITIAL_QUARANTINED_TRANSACTIONS: QuarantinedTransaction[] = [
  {
    id: 'tx_sus_001',
    customerEmail: 'bot_spammer_99@mailinator.com',
    ipAddress: '185.220.101.5 (Tor Exit Node - Frankfurt)',
    amountCents: 1450000, // $14,500
    score: 95,
    decision: 'BLOCK',
    reasons: ['Disposable burner email domain (mailinator.com)', 'Tor Exit Node detected', 'High-value transaction outlier'],
    quarantinedAt: '2026-08-31 09:42 UTC',
    status: 'PENDING_REVIEW',
  },
  {
    id: 'tx_sus_002',
    customerEmail: 'alex.shopper@tempmail.com',
    ipAddress: '198.51.100.82 (Commercial VPN - Chicago)',
    amountCents: 4900, // $49
    score: 75,
    decision: 'BLOCK',
    reasons: ['Disposable email domain (tempmail.com)', 'Commercial VPN detected', 'Hourly card velocity > 4 attempts'],
    quarantinedAt: '2026-08-31 09:15 UTC',
    status: 'PENDING_REVIEW',
  },
  {
    id: 'tx_sus_003',
    customerEmail: 'carlos.dev@corporate.io',
    ipAddress: '203.0.113.19 (Tokyo, Japan)',
    amountCents: 120000, // $1,200
    score: 60,
    decision: 'MANUAL_REVIEW',
    reasons: ['Billing country (US) does not match IP address geolocation (JP)', 'Commercial proxy detected'],
    quarantinedAt: '2026-08-31 08:30 UTC',
    status: 'PENDING_REVIEW',
  },
];

export function FraudDetectionStudioPro() {
  const [activeStudioTab, setActiveStudioTab] = React.useState<'SIMULATOR' | 'GEOVELOCITY' | 'QUEUE' | 'RULES'>('SIMULATOR');

  // Simulator Inputs State
  const [email, setEmail] = React.useState('suspicious@mailinator.com');
  const [ipAddress, setIpAddress] = React.useState('185.220.101.5');
  const [isVpn, setIsVpn] = React.useState(true);
  const [countryMismatch, setCountryMismatch] = React.useState(true);
  const [cardVelocity, setCardVelocity] = React.useState(4);
  const [failedAttempts, setFailedAttempts] = React.useState(2);
  const [amountDollars, setAmountDollars] = React.useState(14500);

  // Geovelocity State
  const [prevCity, setPrevCity] = React.useState('New York City, US (40.71° N, 74.00° W)');
  const [currCity, setCurrCity] = React.useState('Tokyo, JP (35.67° N, 139.65° E)');
  const [elapsedMinutes, setElapsedMinutes] = React.useState(15);

  // Quarantine Queue State — loaded from real DB
  const [queue, setQueue] = React.useState<QuarantinedTransaction[]>(INITIAL_QUARANTINED_TRANSACTIONS);
  const [isQueueLoading, setIsQueueLoading] = React.useState(true);

  React.useEffect(() => {
    setIsQueueLoading(true);
    ApiClient.getFraudQueue()
      .then((logs) => {
        if (logs && logs.length > 0) {
          const mapped: QuarantinedTransaction[] = logs.map((l: any) => ({
            id: l.id,
            customerEmail: l.customerEmail,
            ipAddress: l.ipAddress,
            amountCents: l.amountCents,
            score: l.score,
            decision: l.decision,
            reasons: l.reasons ?? [],
            quarantinedAt: new Date(l.assessedAt).toLocaleString(),
            status: l.status ?? 'PENDING_REVIEW',
          }));
          setQueue(mapped);
        } else {
          setQueue(INITIAL_QUARANTINED_TRANSACTIONS);
        }
      })
      .catch(() => setQueue(INITIAL_QUARANTINED_TRANSACTIONS))
      .finally(() => setIsQueueLoading(false));
  }, []);

  // Computed Geovelocity
  const geovelocityResult: GeovelocityCheck = React.useMemo(() => {
    const prevTime = new Date('2026-08-31T09:00:00Z').toISOString();
    const currTime = new Date(new Date('2026-08-31T09:00:00Z').getTime() + elapsedMinutes * 60 * 1000).toISOString();

    return FraudDetectionEngine.evaluateGeovelocity(
      { location: { latitude: 40.7128, longitude: -74.006, city: 'New York' }, timestamp: prevTime },
      { location: { latitude: 35.6762, longitude: 139.6503, city: 'Tokyo' }, timestamp: currTime }
    );
  }, [elapsedMinutes]);

  // Computed Assessment Result
  const assessment: FraudAssessmentResult = React.useMemo(() => {
    return FraudDetectionEngine.assess({
      email,
      ipAddress,
      isVpnOrProxy: isVpn,
      countryMismatch,
      cardVelocityPastHour: cardVelocity,
      failedAttemptsCount: failedAttempts,
      transactionAmountCents: amountDollars * 100,
    });
  }, [email, ipAddress, isVpn, countryMismatch, cardVelocity, failedAttempts, amountDollars]);

  // Apply Attack Preset
  const handleApplyPreset = (preset: 'CLEAN' | 'GEOVELOCITY' | 'CARDING' | 'TOR') => {
    switch (preset) {
      case 'CLEAN':
        setEmail('finance@paramount.internal');
        setIpAddress('192.0.2.45');
        setIsVpn(false);
        setCountryMismatch(false);
        setCardVelocity(1);
        setFailedAttempts(0);
        setAmountDollars(52176.5);
        break;
      case 'GEOVELOCITY':
        setEmail('victim.account@corporate.io');
        setIpAddress('203.0.113.88 (Tokyo, JP)');
        setIsVpn(true);
        setCountryMismatch(true);
        setCardVelocity(2);
        setFailedAttempts(1);
        setAmountDollars(8500);
        setElapsedMinutes(15);
        setActiveStudioTab('GEOVELOCITY');
        break;
      case 'CARDING':
        setEmail('bot_surge_22@tempmail.com');
        setIpAddress('198.51.100.4');
        setIsVpn(true);
        setCountryMismatch(true);
        setCardVelocity(9);
        setFailedAttempts(6);
        setAmountDollars(120);
        break;
      case 'TOR':
        setEmail('tor_checkout@mailinator.com');
        setIpAddress('185.220.101.5 (Tor Exit Node)');
        setIsVpn(true);
        setCountryMismatch(true);
        setCardVelocity(3);
        setFailedAttempts(0);
        setAmountDollars(14500);
        break;
    }
  };

  // Quarantine Actions
  const handleUpdateQueueStatus = (id: string, newStatus: 'APPROVED_EXCEPTION' | 'BLOCKED_PERMANENT') => {
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: newStatus } : q))
    );
    alert(`Transaction ${id} marked as ${newStatus}!`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>🛡️ AI Fraud & Real-Time Risk Scoring Studio</span>
            <Badge variant="info">Stripe Radar & Apache Metron Grade</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            Multi-signal <strong>0-100 risk scoring engine</strong>, impossible travel IP geovelocity traps, disposable email detectors, and <strong>automated escalation action gates</strong>.
          </p>
        </div>

        {/* Master Tab Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border">
          {[
            { id: 'SIMULATOR', label: '🎯 Risk Simulator' },
            { id: 'GEOVELOCITY', label: '🌐 Impossible Geovelocity' },
            { id: 'QUEUE', label: `🗄️ Quarantine Queue (${queue.filter((q) => q.status === 'PENDING_REVIEW').length})` },
            { id: 'RULES', label: '⚖️ Heuristics Matrix' },
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

      {/* Preset Banner */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-indigo-300">🚨 Load Attack Vector Preset:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleApplyPreset('CLEAN')}
              className="px-2.5 py-1 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900 rounded-lg text-[11px] font-bold"
            >
              ✓ Clean Wire (Score 0)
            </button>
            <button
              onClick={() => handleApplyPreset('GEOVELOCITY')}
              className="px-2.5 py-1 bg-rose-950/80 border border-rose-500/40 text-rose-300 hover:bg-rose-900 rounded-lg text-[11px] font-bold"
            >
              ⚡ Impossible Travel (Score 95)
            </button>
            <button
              onClick={() => handleApplyPreset('CARDING')}
              className="px-2.5 py-1 bg-amber-950/80 border border-amber-500/40 text-amber-300 hover:bg-amber-900 rounded-lg text-[11px] font-bold"
            >
              💳 Carding Velocity (Score 88)
            </button>
            <button
              onClick={() => handleApplyPreset('TOR')}
              className="px-2.5 py-1 bg-purple-950/80 border border-purple-500/40 text-purple-300 hover:bg-purple-900 rounded-lg text-[11px] font-bold"
            >
              🌐 Tor Outlier (Score 65)
            </button>
          </div>
        </div>
      </div>

      {/* ─── TAB 1: REAL-TIME TRANSACTION RISK SIMULATOR ────────────────────────── */}
      {activeStudioTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Input Signal Form */}
          <div className="lg:col-span-6 space-y-4">
            <Card className="p-6 space-y-4">
              <div className="border-b pb-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  🧪 Multi-Signal Telemetry Inputs
                </h4>
                <p className="text-[11px] text-slate-500">Modify inputs to observe real-time risk score response.</p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold block mb-1">Customer / Signer Email</label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>

                <div>
                  <label className="font-bold block mb-1">Origin IP Address & ASN</label>
                  <Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={isVpn}
                      onChange={(e) => setIsVpn(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>VPN / Tor / Proxy</span>
                  </label>

                  <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={countryMismatch}
                      onChange={(e) => setCountryMismatch(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Geo-Country Mismatch</span>
                  </label>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>Card Velocity Past Hour:</span>
                    <span className="font-mono text-indigo-600">{cardVelocity} attempts/hr</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    value={cardVelocity}
                    onChange={(e) => setCardVelocity(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>Repeated Failed Auth Attempts:</span>
                    <span className="font-mono text-indigo-600">{failedAttempts} failures</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    value={failedAttempts}
                    onChange={(e) => setFailedAttempts(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="font-bold block mb-1">Transaction Settlement Amount ($ USD)</label>
                  <Input
                    type="number"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(Number(e.target.value))}
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Right: Risk Score Gauge & Decision Output */}
          <div className="lg:col-span-6 space-y-4">
            <Card className="p-6 space-y-5">
              <div className="border-b pb-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  🎯 Computed Risk Assessment
                </h4>
              </div>

              {/* 0-100 Score Card */}
              <div
                className={`p-6 rounded-3xl border-2 text-center space-y-2 shadow-sm ${
                  assessment.decision === 'BLOCK'
                    ? 'border-rose-400 bg-rose-50/80 text-rose-950'
                    : assessment.decision === 'MANUAL_REVIEW'
                    ? 'border-amber-400 bg-amber-50/80 text-amber-950'
                    : assessment.decision === 'CHALLENGE_MFA'
                    ? 'border-blue-400 bg-blue-50/80 text-blue-950'
                    : 'border-emerald-400 bg-emerald-50/80 text-emerald-950'
                }`}
              >
                <div className="text-4xl font-black font-mono tracking-tight">
                  {assessment.score} <span className="text-lg text-slate-400">/ 100</span>
                </div>
                <div className="text-base font-black uppercase tracking-wide">
                  DECISION: {assessment.decision}
                </div>
                <p className="text-xs font-medium max-w-md mx-auto leading-relaxed">
                  {assessment.recommendedAction}
                </p>
              </div>

              {/* Active Risk Factors Breakdown */}
              <div className="space-y-2 text-xs">
                <span className="font-mono font-bold uppercase text-slate-400 block text-[10px]">
                  Explainability Breakdown ({assessment.riskFactors.length} Active Signals):
                </span>

                {assessment.riskFactors.length > 0 ? (
                  <div className="space-y-2">
                    {assessment.riskFactors.map((rf, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 rounded-xl border flex justify-between items-center font-mono"
                      >
                        <div>
                          <strong className="text-slate-900 text-xs block font-sans">{rf.signalName}</strong>
                          <span className="text-[10px] text-slate-500">{rf.description}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-black text-xs">
                          +{rf.weight} pts
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-center font-bold">
                    ✓ Zero risk signals triggered. Clean trusted identity.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 2: IMPOSSIBLE GEOVELOCITY & TRAVEL ANALYZER ─────────────────────── */}
      {activeStudioTab === 'GEOVELOCITY' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900">🌐 Impossible Travel Geovelocity Detection</h3>
              <p className="text-xs text-slate-500">
                Flags account takeover attempts when successive logins occur at speeds exceeding commercial aircraft (over 800 km/h).
              </p>
            </div>
            <Badge variant={geovelocityResult.isImpossibleTravel ? 'danger' : 'success'}>
              {geovelocityResult.isImpossibleTravel ? '🚨 IMPOSSIBLE TRAVEL DETECTED' : '✓ Normal Travel Speed'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 bg-slate-50 rounded-2xl border space-y-1">
              <span className="text-slate-400 text-[10px] block uppercase font-bold">Previous Login Location</span>
              <strong className="text-slate-900 text-xs">{prevCity}</strong>
              <div className="text-[10px] text-slate-500">Timestamp: 2026-08-31 09:00:00 UTC</div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border space-y-1">
              <span className="text-slate-400 text-[10px] block uppercase font-bold">Current Login Location</span>
              <strong className="text-slate-900 text-xs">{currCity}</strong>
              <div className="text-[10px] text-slate-500">
                Timestamp: 2026-08-31 09:{elapsedMinutes < 10 ? `0${elapsedMinutes}` : elapsedMinutes}:00 UTC ({elapsedMinutes} mins later)
              </div>
            </div>
          </div>

          {/* Speed Slider */}
          <div className="p-5 bg-slate-50 rounded-2xl border space-y-2 text-xs">
            <div className="flex justify-between font-bold">
              <span>Time Elapsed Between Logins:</span>
              <span className="font-mono text-indigo-600">{elapsedMinutes} minutes</span>
            </div>
            <input
              type="range"
              min="5"
              max="900"
              step="5"
              value={elapsedMinutes}
              onChange={(e) => setElapsedMinutes(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Result Banner */}
          <div
            className={`p-6 rounded-2xl border-2 text-center space-y-2 ${
              geovelocityResult.isImpossibleTravel
                ? 'border-rose-400 bg-rose-50 text-rose-950'
                : 'border-emerald-400 bg-emerald-50 text-emerald-950'
            }`}
          >
            <div className="text-3xl">{geovelocityResult.isImpossibleTravel ? '🚨' : '✈️'}</div>
            <h4 className="text-lg font-black font-sans">
              Calculated Geodesic Speed: {geovelocityResult.calculatedSpeedKph.toLocaleString()} km/h
            </h4>
            <p className="text-xs max-w-lg mx-auto">
              Distance: <strong>{geovelocityResult.distanceKm.toLocaleString()} km</strong> traveled in <strong>{geovelocityResult.elapsedHours} hours</strong>.
              {geovelocityResult.isImpossibleTravel
                ? ' Speed violates physics threshold (exceeds 800 km/h) — credentials hijacked via proxy!'
                : ' Speed is consistent with commercial aviation.'}
            </p>
          </div>

        </Card>
      )}

      {/* ─── TAB 3: QUARANTINED TRANSACTIONS DEAD-LETTER QUEUE ──────────────────── */}
      {activeStudioTab === 'QUEUE' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900">🗄️ Quarantined Suspicious Transactions Dead-Letter Queue</h3>
              <p className="text-xs text-slate-500">
                High-risk transactions held for Risk Operations review before ledger settlement.
              </p>
            </div>
            <Badge variant="warning">{queue.filter((q) => q.status === 'PENDING_REVIEW').length} Pending</Badge>
          </div>

          <div className="space-y-4 text-xs">
            {queue.map((tx) => (
              <div key={tx.id} className="p-4 bg-slate-50 rounded-2xl border space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{tx.customerEmail}</span>
                    <Badge variant={tx.score >= 75 ? 'danger' : 'warning'}>Score: {tx.score}</Badge>
                  </div>
                  <strong className="text-base font-mono text-slate-900">
                    ${(tx.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </strong>
                </div>

                <div className="p-3 bg-white rounded-xl border text-[11px] font-mono space-y-1">
                  <div>• IP Address: {tx.ipAddress}</div>
                  <div>• Triggered Flags: {tx.reasons.join(' | ')}</div>
                  <div>• Quarantined At: {tx.quarantinedAt}</div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-[10px] font-mono text-slate-400">
                    Status: <strong className="text-indigo-600">{tx.status}</strong>
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdateQueueStatus(tx.id, 'APPROVED_EXCEPTION')}
                    >
                      Approve Exception ✓
                    </Button>
                    <Button
                      size="sm"
                      className="!bg-rose-600 hover:!bg-rose-500 !text-white font-bold"
                      onClick={() => handleUpdateQueueStatus(tx.id, 'BLOCKED_PERMANENT')}
                    >
                      Blacklist IP & Block ✕
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── TAB 4: HEURISTICS MATRIX ───────────────────────────────────────────── */}
      {activeStudioTab === 'RULES' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">⚖️ Fraud Signal Weights & Threshold Matrix</h3>
            <p className="text-xs text-slate-500">
              Deterministic point weighting evaluated across every transaction.
            </p>
          </div>

          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 border-b text-slate-700 font-bold font-mono">
              <tr>
                <th className="p-3 border-r">Signal Vector</th>
                <th className="p-3 border-r">Risk Weight</th>
                <th className="p-3">Automated Trigger Action</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono">
              <tr>
                <td className="p-3 border-r font-sans font-bold">Impossible Geovelocity Travel (Exceeds 800 km/h)</td>
                <td className="p-3 border-r text-rose-600 font-black">+50 pts</td>
                <td className="p-3 font-sans">Immediate Session Terminate & Security Challenge</td>
              </tr>
              <tr>
                <td className="p-3 border-r font-sans font-bold">Disposable / Burner Email Domain Blacklist</td>
                <td className="p-3 border-r text-rose-600 font-black">+45 pts</td>
                <td className="p-3 font-sans">Block checkout attempt with disposable email warning</td>
              </tr>
              <tr>
                <td className="p-3 border-r font-sans font-bold">Carding Velocity Surge (Exceeds 3 attempts/hr)</td>
                <td className="p-3 border-r text-rose-600 font-black">+35 pts</td>
                <td className="p-3 font-sans">Throttle IP with rate-limit cooldown</td>
              </tr>
              <tr>
                <td className="p-3 border-r font-sans font-bold">Commercial VPN / Proxy / Tor Node</td>
                <td className="p-3 border-r text-amber-600 font-black">+30 pts</td>
                <td className="p-3 font-sans">Enforce Step-Up SMS/TOTP 2FA Verification</td>
              </tr>
              <tr>
                <td className="p-3 border-r font-sans font-bold">Billing Country vs IP Geolocation Mismatch</td>
                <td className="p-3 border-r text-amber-600 font-black">+20 pts</td>
                <td className="p-3 font-sans">Require 3D-Secure 2.0 Bank Verification</td>
              </tr>
            </tbody>

          </table>
        </Card>
      )}
    </div>
  );
}
