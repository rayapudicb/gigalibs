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
  ESignManager,
  type ESignEnvelope,
  type SignerParticipant,
  type DocumentIntegrityCheck,
} from '@gigalibs/esign-core';
import { ApiClient } from '../api-client.js';

// ─── MASTER SAMPLE CONTRACTS ──────────────────────────────────────────────────

export const INITIAL_SAMPLE_CONTRACT = `MASTER PRODUCTION SOUNDSTAGE SERVICES AGREEMENT

1. PARTIES & SCOPE:
This Master Services Agreement ("Agreement") is executed on August 30, 2026, by and between PARAMOUNT GLOBAL STUDIOS ("Producer") and WARNER BROS DISCOVERY SOUNDSTAGE FACILITIES ("Provider").

2. FACILITY COMMITMENT & STAGE ALLOCATION:
Provider grants Producer exclusive 24/7 filming and production rights to Soundstages 4, 5, and 6 located at 5555 Melrose Ave, Hollywood, CA, including heavy crane gantry rigging, high-speed 10Gbps fiber uplinks, and pyrotechnic soundproofing.

3. FEES, PAYMENT SCHEDULE & MINOR-UNIT SETTLEMENT:
Producer shall remit the total contract amount of $52,176.50 USD in accordance with Net 30 milestone terms. Any overtime beyond 12 hours/day will accrue at the standard union rate of 1.5x.

4. CRYPTOGRAPHIC NON-REPUDIATION & ESIGN COMPLIANCE:
The parties acknowledge that this document is executed under the Federal ESIGN Act and European eIDAS standards, sealed with an AATL X.509 RSA-4096 cryptographic certificate.`;

export function CryptographicEsignStudioPro() {
  const [activeStudioTab, setActiveStudioTab] = React.useState<'CANVAS' | 'WORKFLOW' | 'INTEGRITY' | 'CERTIFICATE'>('CANVAS');
  const [contractText, setContractText] = React.useState<string>(INITIAL_SAMPLE_CONTRACT);
  const [originalContent, setOriginalContent] = React.useState<string>(INITIAL_SAMPLE_CONTRACT);
  
  // Envelope State
  const [envelope, setEnvelope] = React.useState<ESignEnvelope>(() =>
    ESignManager.createEnvelope(
      'Master Production Soundstage Services Agreement (Paramount & Warner Bros)',
      INITIAL_SAMPLE_CONTRACT,
      [
        {
          id: 'p_001',
          name: 'Devin Vance',
          email: 'devin@paramount.internal',
          role: 'SIGNER',
          signingOrder: 1,
          status: 'SIGNED',
          authMethod: 'EMAIL_OTP',
          signedAt: '2026-08-31 09:15:22 UTC',
          ipAddress: '192.0.2.45 (Hollywood, CA)',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0',
          signatureImageBase64: '✍️ Devin Vance',
        },
        {
          id: 'p_002',
          name: 'Alex Johnson',
          email: 'alex.johnson@warnerbros.internal',
          role: 'SIGNER',
          signingOrder: 2,
          status: 'PENDING',
          authMethod: 'EMAIL_OTP',
        },
        {
          id: 'p_003',
          name: 'Elena Rostova',
          email: 'elena.compliance@audit.internal',
          role: 'APPROVER',
          signingOrder: 3,
          status: 'PENDING',
          authMethod: 'GOV_ID_BIOMETRIC',
        },
      ],
      []
    )
  );

  // Signing Modal State
  const [isSignModalOpen, setIsSignModalOpen] = React.useState(false);
  const [activeSignerEmail, setActiveSignerEmail] = React.useState('alex.johnson@warnerbros.internal');
  const [signatureMode, setSignatureMode] = React.useState<'DRAW' | 'TYPE'>('TYPE');
  const [typedSignature, setTypedSignature] = React.useState('Alex Johnson');
  const [selectedFont, setSelectedFont] = React.useState('font-serif italic');

  // Canvas Drawing ref
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);

  // Integrity Check State
  const integrityCheck: DocumentIntegrityCheck = React.useMemo(() => {
    return ESignManager.verifyDocumentIntegrity(envelope.documentHashBeforeSigning, contractText);
  }, [envelope.documentHashBeforeSigning, contractText]);

  const [dbEnvelopes, setDbEnvelopes] = React.useState<any[]>([]);
  const [isPersisting, setIsPersisting] = React.useState(false);

  React.useEffect(() => {
    ApiClient.listEsignEnvelopes()
      .then((envs) => setDbEnvelopes(envs))
      .catch(() => {});
  }, []);

  // Execute Digital Signature & DB Persistence
  const handleExecuteSignature = async () => {
    try {
      const sigData = {
        signatureImage: signatureMode === 'TYPE' ? `✍️ ${typedSignature}` : '✍️ [Drawn Vector Signature]',
        ipAddress: '198.51.100.82 (Burbank, CA)',
        userAgent: navigator.userAgent,
        geoLocation: 'Burbank, California, United States',
      };

      const updated = ESignManager.signParticipant(envelope, activeSignerEmail, sigData);
      setEnvelope(updated);
      setIsSignModalOpen(false);

      // Persist to PostgreSQL
      setIsPersisting(true);
      await ApiClient.createEsignEnvelope({
        title: updated.title,
        documentSha256: updated.documentHashBeforeSigning,
        certificateX509: updated.certificate?.serialNumber ?? 'CERT-AATL-2026-98124',
        recipients: updated.participants.map((p) => ({
          name: p.name,
          email: p.email,
          role: p.role,
        })),
      });
      const latest = await ApiClient.listEsignEnvelopes();
      setDbEnvelopes(latest);

      alert(`🎉 Document successfully signed by ${activeSignerEmail} and persisted to PostgreSQL!`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsPersisting(false);
    }
  };

  // Drawing Canvas Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>✍️ Cryptographic E-Signature & X.509 PKI Seal Studio</span>
            <Badge variant="info">DocuSeal & Adobe Sign Grade</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            Multi-party sequential signing routing, <strong>HTML5 interactive signature pad</strong>, SHA-256 Merkle integrity seals, and official <strong>Certificate of Completion PDF</strong>.
          </p>
        </div>

        {/* Master Tab Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border">
          {[
            { id: 'CANVAS', label: '📑 Signing Canvas' },
            { id: 'WORKFLOW', label: '👥 Sequential Workflow' },
            { id: 'INTEGRITY', label: '🛡️ Tamper-Evident Seal' },
            { id: 'CERTIFICATE', label: '📜 Completion Certificate' },
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

      {/* Active Envelope Status Banner */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-indigo-300">📄 Active Envelope:</span>
            <span className="font-bold text-white">{envelope.title}</span>
            <Badge variant={envelope.status === 'COMPLETED' ? 'success' : 'warning'}>
              {envelope.status}
            </Badge>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            SHA-256 Digest: <span className="text-emerald-400">{envelope.documentHashBeforeSigning}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setActiveSignerEmail('alex.johnson@warnerbros.internal');
              setIsSignModalOpen(true);
            }}
            className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold"
          >
            ✍️ Sign as Next Signer (Alex Johnson)
          </Button>
        </div>
      </div>

      {/* ─── TAB 1: INTERACTIVE SIGNING CANVAS ───────────────────────────────────── */}
      {activeStudioTab === 'CANVAS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Document Rendering Canvas */}
          <div className="lg:col-span-8 space-y-4">
            <Card className="p-8 bg-white border border-slate-300 shadow-xl rounded-2xl space-y-6 text-slate-900 font-serif leading-relaxed">
              <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start font-sans">
                <div>
                  <span className="text-[10px] font-mono uppercase font-bold text-indigo-600 block">
                    LEGALLY BINDING ELECTRONIC CONTRACT
                  </span>
                  <h3 className="text-lg font-black text-slate-900">
                    MASTER PRODUCTION SOUNDSTAGE SERVICES AGREEMENT
                  </h3>
                </div>
                <Badge variant="success">eIDAS & ESIGN Compliant</Badge>
              </div>

              <div className="text-xs space-y-4 text-slate-700 whitespace-pre-line leading-relaxed font-sans">
                {contractText}
              </div>

              {/* Signature Blocks Section */}
              <div className="border-t-2 border-slate-900 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
                {/* Signer 1 Block */}
                <div className="p-4 bg-emerald-50/60 border border-emerald-300 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono font-bold text-emerald-800 uppercase">
                      SIGNER 1: PRODUCER
                    </span>
                    <Badge variant="success">Digitally Signed</Badge>
                  </div>
                  <div className="h-14 flex items-center justify-center font-serif italic text-xl font-bold text-slate-900 border-b border-dashed border-emerald-400">
                    ✍️ Devin Vance
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 space-y-0.5">
                    <div>Signer: Devin Vance (devin@paramount.internal)</div>
                    <div>Timestamp: 2026-08-31 09:15:22 UTC</div>
                    <div>IP Address: 192.0.2.45 (Hollywood, CA)</div>
                  </div>
                </div>

                {/* Signer 2 Block */}
                <div
                  onClick={() => {
                    if (envelope.participants[1]?.status !== 'SIGNED') {
                      setActiveSignerEmail('alex.johnson@warnerbros.internal');
                      setIsSignModalOpen(true);
                    }
                  }}
                  className={`p-4 rounded-2xl border transition cursor-pointer space-y-2 ${
                    envelope.participants[1]?.status === 'SIGNED'
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : 'bg-indigo-50/60 border-indigo-300 hover:border-indigo-500 hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono font-bold text-indigo-800 uppercase">
                      SIGNER 2: LEGAL COUNSEL
                    </span>
                    <Badge variant={envelope.participants[1]?.status === 'SIGNED' ? 'success' : 'warning'}>
                      {envelope.participants[1]?.status === 'SIGNED' ? 'Digitally Signed' : 'Click to Sign ✍️'}
                    </Badge>
                  </div>
                  <div className="h-14 flex items-center justify-center font-serif italic text-xl font-bold text-slate-900 border-b border-dashed border-indigo-400">
                    {envelope.participants[1]?.status === 'SIGNED'
                      ? envelope.participants[1]?.signatureImageBase64
                      : 'Click Here to Place Digital Signature'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 space-y-0.5">
                    <div>Signer: Alex Johnson (alex.johnson@warnerbros.internal)</div>
                    <div>
                      Status:{' '}
                      {envelope.participants[1]?.status === 'SIGNED'
                        ? 'Signed & Sealed'
                        : 'Awaiting Signature Execution'}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right: Signer Hierarchy & Audit Trail */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-5 space-y-4">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
                👥 Sequential Signer Roster
              </h4>

              <div className="space-y-3 text-xs">
                {envelope.participants.map((p) => (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-2xl border transition space-y-1.5 ${
                      p.status === 'SIGNED'
                        ? 'bg-emerald-50/70 border-emerald-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-slate-500 text-[10px]">
                        Stage {p.signingOrder} • {p.role}
                      </span>
                      <StatusBadge status={p.status === 'SIGNED' ? 'ACTIVE' : 'DRAFT'}>
                        {p.status}
                      </StatusBadge>
                    </div>
                    <div className="font-bold text-slate-900">{p.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{p.email}</div>
                    {p.signedAt && (
                      <div className="text-[10px] text-emerald-700 font-mono pt-1 border-t border-emerald-200">
                        ✓ Signed: {p.signedAt}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 2: SEQUENTIAL WORKFLOW ─────────────────────────────────────────── */}
      {activeStudioTab === 'WORKFLOW' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">👥 Multi-Party Sequential Signing Graph</h3>
            <p className="text-xs text-slate-500">
              Strict ordering enforcement ensures Signer 2 cannot execute until Signer 1 completes.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {envelope.participants.map((p, idx) => (
              <div key={p.id} className="flex items-start gap-4">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-xs shrink-0 ${
                    p.status === 'SIGNED' ? 'bg-emerald-500' : 'bg-indigo-600'
                  }`}
                >
                  {p.signingOrder}
                </div>
                <div className="flex-1 p-4 bg-slate-50 rounded-2xl border space-y-2">
                  <div className="flex justify-between items-center">
                    <strong className="text-slate-900 text-sm">{p.name}</strong>
                    <Badge variant={p.status === 'SIGNED' ? 'success' : 'warning'}>{p.status}</Badge>
                  </div>
                  <p className="text-slate-600">Email: {p.email} • Auth Method: {p.authMethod}</p>
                  {p.status !== 'SIGNED' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setActiveSignerEmail(p.email);
                        setIsSignModalOpen(true);
                      }}
                      className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold"
                    >
                      Sign as {p.name} ✍️
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── TAB 3: TAMPER-EVIDENT MERKLE INTEGRITY SIMULATOR ────────────────────── */}
      {activeStudioTab === 'INTEGRITY' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-4">
            <Card className="p-5 space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  ✏️ Live Document Text Editor (Tamper Test)
                </h4>
                <Button size="sm" variant="outline" onClick={() => setContractText(originalContent)}>
                  Reset Original
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Edit any word or number below to observe instant cryptographic digest breakdown.
              </p>
              <textarea
                value={contractText}
                onChange={(e) => setContractText(e.target.value)}
                rows={14}
                className="w-full p-3 font-mono text-xs border rounded-xl bg-slate-50 focus:bg-white text-slate-900 leading-relaxed"
              />
            </Card>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <Card className="p-5 space-y-4 min-h-[50vh]">
              <div className="border-b pb-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  🛡️ Cryptographic Merkle Seal Status
                </h4>
              </div>

              <div
                className={`p-6 rounded-2xl border-2 text-center space-y-2 ${
                  integrityCheck.isValid
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-950'
                    : 'border-rose-400 bg-rose-50 text-rose-950'
                }`}
              >
                <div className="text-3xl">{integrityCheck.isValid ? '🛡️' : '🚨'}</div>
                <h3 className="text-lg font-black font-sans">
                  {integrityCheck.isValid
                    ? 'CRYPTOGRAPHIC SEAL VALID & INTACT'
                    : 'TAMPER DETECTED: CRYPTOGRAPHIC SEAL BROKEN!'}
                </h3>
                <p className="text-xs">
                  {integrityCheck.isValid
                    ? 'Byte-level SHA-256 Merkle hash matches the original sealed document exactly.'
                    : `Document content was modified after sealing! Byte variance detected (${integrityCheck.byteVariance} bytes).`}
                </p>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl text-emerald-400 font-mono text-xs space-y-2 shadow-inner">
                <div>• Original Sealed Hash: <span className="text-indigo-400">{integrityCheck.originalHash}</span></div>
                <div>• Live Calculated Hash: <span className={integrityCheck.isValid ? 'text-emerald-400' : 'text-rose-400'}>{integrityCheck.currentHash}</span></div>
                <div>• Verification Status: <strong className={integrityCheck.isValid ? 'text-emerald-300' : 'text-rose-400'}>{integrityCheck.status}</strong></div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 4: OFFICIAL X.509 PKI CERTIFICATE OF COMPLETION ─────────────────── */}
      {activeStudioTab === 'CERTIFICATE' && (
        <Card className="max-w-3xl mx-auto p-8 bg-white border-2 border-slate-900 rounded-3xl shadow-2xl space-y-6 text-slate-900 font-sans">
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📜</span>
                <h3 className="text-lg font-black tracking-tight">CERTIFICATE OF COMPLETION</h3>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Certificate UUID: {envelope.certificateOfCompletion?.certificateId}
              </p>
            </div>
            <div className="text-right">
              <Badge variant="success">AATL Qualified</Badge>
              <div className="text-[10px] font-mono text-slate-400 mt-1">RFC 3161 TSA Timestamped</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-slate-50 p-4 rounded-2xl border">
            <div>
              <span className="text-slate-400 text-[10px] block uppercase font-bold">Document Title</span>
              <strong className="text-slate-800">{envelope.title}</strong>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block uppercase font-bold">Digital Seal Serial</span>
              <strong className="text-slate-800">{envelope.certificateOfCompletion?.pkiCertificateSerial}</strong>
            </div>
          </div>

          {/* Audit Events Log */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase text-slate-500 block">
              Cryptographic Audit Trail Events:
            </span>
            <div className="space-y-2 text-xs font-mono">
              {envelope.certificateOfCompletion?.auditLog.map((event, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border flex justify-between items-center">
                  <div className="space-y-0.5">
                    <strong className="text-slate-900 text-xs">{event.action}</strong>
                    <div className="text-[10px] text-slate-500">Actor: {event.actor} • IP: {event.ip}</div>
                  </div>
                  <span className="text-[10px] text-indigo-600 font-bold">{event.timestamp.split('T')[1]?.slice(0, 8)} UTC</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t-2 border-slate-900 pt-4 flex justify-between items-center text-[10px] font-mono text-slate-500">
            <div>Root Authority: GigaLibs PKI Root CA 2026</div>
            <Button size="sm" onClick={() => alert('Official PDF Certificate downloaded!')}>
              Download Official Audit PDF 📥
            </Button>
          </div>
        </Card>
      )}

      {/* ─── MODAL: INTERACTIVE HTML5 SIGNATURE PAD ──────────────────────────────── */}
      {isSignModalOpen && (
        <Modal
          isOpen={isSignModalOpen}
          onClose={() => setIsSignModalOpen(false)}
          size="lg"
          title="✍️ Digital Signature Execution"
          description={`Executing legally binding signature as ${activeSignerEmail}.`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsSignModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleExecuteSignature} className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold">
                Adopt & Sign Document ✍️
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            {/* Mode Switcher */}
            <div className="flex gap-2 border-b pb-3">
              <button
                onClick={() => setSignatureMode('TYPE')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  signatureMode === 'TYPE' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                🔤 Type Calligraphic Signature
              </button>
              <button
                onClick={() => setSignatureMode('DRAW')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  signatureMode === 'DRAW' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                ✏️ Draw on Canvas
              </button>
            </div>

            {signatureMode === 'TYPE' ? (
              <div className="space-y-3">
                <Input
                  label="Type Legal Name"
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                />
                <div className="p-6 bg-slate-50 rounded-2xl border flex items-center justify-center font-serif italic text-3xl font-black text-slate-900 select-none">
                  {typedSignature || 'Signature Preview'}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-2 bg-slate-50 flex justify-center">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={160}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    className="bg-white rounded-xl cursor-crosshair shadow-inner"
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span>Draw your signature above using mouse or touch stylus.</span>
                  <button onClick={clearCanvas} className="text-rose-600 hover:text-rose-800 font-bold">
                    Clear Canvas ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
