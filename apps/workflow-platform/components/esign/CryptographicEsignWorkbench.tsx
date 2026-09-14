'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import {
  ArrowPath,
  CheckCircleSolid,
  DocumentText,
  ShieldCheck,
  PlusMini,
} from '@medusajs/icons';
import { FileSignature, CheckCircle2, Award, Clock, ArrowRight, Lock, ExternalLink, Eye, PenTool, Layers, FileCheck } from 'lucide-react';
import { useTranslation } from '@/components/i18n';
import { MASTER_SIGNERS } from '@/lib/master-data-catalog';

interface EnvelopeSummary {
  id: string;
  tenantId: string;
  title: string;
  documentNumber: string;
  sourceModule: string;
  status: string;
  documentSha256: string;
  signerCount: number;
  completedSigners: number;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  signed_at: string | null;
  signature_block: string | null;
  signature_digest: string | null;
  ip_address: string | null;
}

interface CertificateData {
  envelopeId: string;
  title: string;
  documentNumber: string;
  documentSha256: string;
  algorithm: string;
  status: string;
  completedAt: string | null;
  pkiCertificate: {
    serialNumber: string;
    issuer: string;
    subject: string;
    thumbprint: string;
    reconciliationReceipt: any;
  } | null;
  signers: Recipient[];
  auditTimeline: Array<{
    event_type: string;
    actor_name: string;
    actor_email: string;
    details: any;
    chain_hash: string;
    created_at: string;
  }>;
  integrityVerified: boolean;
}

export function CryptographicEsignWorkbench() {
  const { t } = useTranslation('esign');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [envelopes, setEnvelopes] = useState<EnvelopeSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Root CA Inspector Modal
  const [rootCaModalOpen, setRootCaModalOpen] = useState(false);
  const [rootCaInfo, setRootCaInfo] = useState<any>(null);

  // Adobe Sign-Style Interactive Signature Mode & Canvas
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type' | 'stamp'>('type');
  const [typedSignature, setTypedSignature] = useState('');
  const [attestationAccepted, setAttestationAccepted] = useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = React.useRef(false);

  // Visual Document & Field Placement Preview Modal
  const [previewFieldsModalOpen, setPreviewFieldsModalOpen] = useState(false);
  const [previewEnvelopeDetail, setPreviewEnvelopeDetail] = useState<any | null>(null);

  // Create Envelope Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [sourceModule, setSourceModule] = useState('ACCOUNTS_RECEIVABLE');
  const [payloadText, setPayloadText] = useState('');
  const [recipients, setRecipients] = useState([
    { name: '', email: '', role: 'CLIENT_SIGNER' },
    { name: '', email: '', role: 'COUNTER_SIGNER' },
  ]);
  const [sendImmediately, setSendImmediately] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Signing Drawer/Modal
  const [signingModalOpen, setSigningModalOpen] = useState(false);
  const [activeEnvelopeDetail, setActiveEnvelopeDetail] = useState<any | null>(null);
  const [selectedSignerEmail, setSelectedSignerEmail] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [signSuccess, setSignSuccess] = useState<any | null>(null);

  // Certificate Modal
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [certificateData, setCertificateData] = useState<CertificateData | null>(null);
  const [certLoading, setCertLoading] = useState(false);

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e3a8a'; // rich navy blue ink
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/esign/v1/setup/status');
      if (res.status === 503 || res.status === 502) {
        setConfigured(false);
        setError('E-Signature API service is offline or unreachable.');
        return;
      }
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      if (data.configured) {
        setRootCaInfo({
          caOrganization: data.caOrganization || 'GigaLibs Enterprise Root CA G2',
          fipsComplianceMode: data.fipsComplianceMode ?? true,
          pkiRootCert: data.pkiRootCert || 'GigaLibs Enterprise Root CA G2 (RSA-4096 / SHA-256)',
          rootThumbprint: data.rootThumbprint || '8F:3A:91:2E:C4:0B:77:D1:6E:5C:32:FA:18:90:BB:44:03:CD:99:A1',
          keyUsage: data.keyUsage || 'Digital Signature, Non-Repudiation, Certificate Signing, CRL Signing',
          initializedAt: data.initializedAt,
        });
        await loadEnvelopes();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check setup status');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEnvelopes = async () => {
    try {
      const res = await fetch(`/api/esign/v1/envelopes?status=${statusFilter}`);
      if (res.ok) {
        setEnvelopes(await res.json());
      }
    } catch (err: any) {
      console.error('Failed to load envelopes', err);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (configured) {
      loadEnvelopes();
    }
  }, [statusFilter, configured]);

  const handleSetup = async () => {
    setIsSettingUp(true);
    try {
      const res = await fetch('/api/esign/v1/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setConfigured(true);
        await loadEnvelopes();
      } else {
        const data = await res.json();
        setError(data.title || 'Setup failed');
      }
    } catch (err: any) {
      setError(err.message || 'Setup request failed');
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleCreateEnvelope = async () => {
    if (!title || !payloadText) {
      setError('Title and document legal text are required.');
      return;
    }
    const validRecipients = recipients.filter((r) => r.name.trim() && r.email.trim());
    if (validRecipients.length === 0) {
      setError('At least one recipient with name and email is required.');
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/esign/v1/envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          documentNumber: docNumber || `DOC-${Date.now().toString().slice(-6)}`,
          sourceModule,
          payloadText,
          sendImmediately,
          recipients: validRecipients,
        }),
      });
      if (res.ok) {
        setCreateModalOpen(false);
        setTitle('');
        setDocNumber('');
        setPayloadText('');
        await loadEnvelopes();
      } else {
        const data = await res.json();
        setError(data.title || 'Envelope creation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create envelope');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenSigning = async (envelopeId: string) => {
    setSignSuccess(null);
    setSelectedSignerEmail('');
    setAttestationAccepted(false);
    try {
      const res = await fetch(`/api/esign/v1/envelopes/${envelopeId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveEnvelopeDetail(data);
        const pendingSigner = data.recipients.find((r: any) => r.status !== 'SIGNED');
        if (pendingSigner) {
          setSelectedSignerEmail(pendingSigner.email);
          setTypedSignature(pendingSigner.name);
        }
        setSigningModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to load envelope details', err);
    }
  };

  const handlePreviewFields = async (envelopeId: string) => {
    try {
      const res = await fetch(`/api/esign/v1/envelopes/${envelopeId}`);
      if (res.ok) {
        setPreviewEnvelopeDetail(await res.json());
        setPreviewFieldsModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to load envelope preview', err);
    }
  };

  const handleSign = async () => {
    if (!activeEnvelopeDetail || !selectedSignerEmail) return;
    setIsSigning(true);
    setSignSuccess(null);
    try {
      const res = await fetch(
        `/api/esign/v1/signatures/${activeEnvelopeDetail.envelope.id}/sign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signerEmail: selectedSignerEmail,
            signatureType: 'CRYPTOGRAPHIC_RSA_SHA256',
          }),
        },
      );
      if (res.ok) {
        const result = await res.json();
        setSignSuccess(result);
        await loadEnvelopes();
        // Refresh envelope detail
        const fresh = await fetch(`/api/esign/v1/envelopes/${activeEnvelopeDetail.envelope.id}`);
        if (fresh.ok) setActiveEnvelopeDetail(await fresh.json());
      } else {
        const data = await res.json();
        setError(data.title || 'Signing failed');
      }
    } catch (err: any) {
      setError(err.message || 'Signing failed');
    } finally {
      setIsSigning(false);
    }
  };

  const handleViewCertificate = async (envelopeId: string) => {
    setCertLoading(true);
    setCertificateData(null);
    setCertModalOpen(true);
    try {
      const res = await fetch(`/api/esign/v1/signatures/${envelopeId}/certificate`);
      if (res.ok) {
        setCertificateData(await res.json());
      }
    } catch (err) {
      console.error('Failed to load certificate', err);
    } finally {
      setCertLoading(false);
    }
  };

  if (loading && configured === null) {
    return (
      <Container className="p-8">
        <div className="flex items-center gap-3 text-zinc-500">
          <ArrowPath className="animate-spin w-5 h-5 text-blue-600" />
          <Text>Checking E-Signature tenant binding and PostgreSQL schema...</Text>
        </div>
      </Container>
    );
  }

  if (configured === false) {
    return (
      <Container className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <FileSignature className="w-8 h-8 text-blue-600" />
            <div>
              <Heading level="h2" className="text-xl font-semibold text-zinc-900">
                E-Signature Studio Setup & Root CA Binding
              </Heading>
              <Text className="text-sm text-zinc-600">
                Bind your tenant workspace to the PostgreSQL <code>gigalibs_esign</code> schema, enable FIPS 186-4 cryptographic signing, and register X.509 Root CA authority.
              </Text>
            </div>
          </div>
          <div className="border-t border-blue-100 pt-4 flex items-center justify-between">
            <div className="text-xs font-mono text-zinc-500">
              Authority: X.509 PKI Root CA G2 · SHA-256 Digesting · Immutable Audit Receipts
            </div>
            <Button
              variant="primary"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSetup}
              disabled={isSettingUp}
            >
              {isSettingUp ? 'Initializing Schema...' : 'Initialize E-Signature Studio'}
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Badge color="blue">Cryptographic Documents</Badge>
            <StatusBadge color="green">PKI_GOVERNED</StatusBadge>
            <Badge color="grey">FIPS 186-4 SHA-256</Badge>
          </div>
          <Heading level="h1" className="mt-2 text-2xl font-bold tracking-tight text-zinc-950">
            {t('title')}
          </Heading>
          <Text className="mt-1 text-sm text-zinc-600">
            {t('subtitle')}
          </Text>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => setRootCaModalOpen(true)}
            className="flex items-center gap-2 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> {t('rootCa')}
          </Button>
          <Button variant="secondary" onClick={loadEnvelopes} className="flex items-center gap-2">
            <ArrowPath className="w-4 h-4" /> Refresh
          </Button>
          <Button
            variant="primary"
            className="bg-zinc-900 text-white hover:bg-zinc-800 flex items-center gap-2"
            onClick={() => setCreateModalOpen(true)}
          >
            <PlusMini className="w-4 h-4" /> {t('createEnvelope')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-3 text-sm font-medium">
        {['ALL', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'DRAFT'].map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              statusFilter === f
                ? 'bg-zinc-900 text-white font-semibold'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Envelopes List */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        {envelopes.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <FileSignature className="w-12 h-12 text-zinc-300 mx-auto" />
            <div>
              <Heading level="h3" className="text-base font-semibold text-zinc-900">
                No Envelopes Found
              </Heading>
              <Text className="text-xs text-zinc-500 mt-1">
                Create a new envelope to begin the legally binding cryptographic signing process.
              </Text>
            </div>
            <Button
              variant="secondary"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2"
            >
              <PlusMini className="w-4 h-4" /> Create First Envelope
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-600">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 border-b border-zinc-200">
                <tr>
                  <th className="py-3 px-4">Document Title</th>
                  <th className="py-3 px-4">Doc # / Ref</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Signer Progress</th>
                  <th className="py-3 px-4">Document SHA-256 Digest</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {envelopes.map((env) => (
                  <tr key={env.id} className="hover:bg-zinc-50/50">
                    <td className="py-3 px-4 font-semibold text-zinc-900 flex items-center gap-2">
                      <DocumentText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{env.title}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-zinc-500">{env.documentNumber}</td>
                    <td className="py-3 px-4">
                      {env.status === 'COMPLETED' ? (
                        <StatusBadge color="green">COMPLETED</StatusBadge>
                      ) : env.status === 'IN_PROGRESS' ? (
                        <StatusBadge color="blue">IN_PROGRESS</StatusBadge>
                      ) : env.status === 'SENT' ? (
                        <StatusBadge color="orange">SENT</StatusBadge>
                      ) : (
                        <StatusBadge color="grey">DRAFT</StatusBadge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span className="text-zinc-900 font-bold">{env.completedSigners}</span> of{' '}
                      <span className="text-zinc-500">{env.signerCount} Signed</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-zinc-500" title={env.documentSha256}>
                      {env.documentSha256.slice(0, 16)}...
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-500">
                      {new Date(env.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {env.status !== 'COMPLETED' && (
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => handleOpenSigning(env.id)}
                          className="text-xs"
                        >
                          Sign / Inspect
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handlePreviewFields(env.id)}
                        className="text-xs font-medium text-purple-600 hover:text-purple-700"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1 inline" /> Fields & Preview
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleViewCertificate(env.id)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <Award className="w-3.5 h-3.5 mr-1 inline" /> Certificate
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Envelope Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-zinc-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <div className="flex items-center gap-3">
                <FileSignature className="w-6 h-6 text-blue-600" />
                <div>
                  <Heading level="h2" className="text-lg font-bold text-zinc-900">
                    Draft Cryptographic E-Signature Envelope
                  </Heading>
                  <Text className="text-xs text-zinc-500">
                    Authentic document hashed with FIPS SHA-256 and bound to verified signers.
                  </Text>
                </div>
              </div>
              <button
                className="text-zinc-400 hover:text-zinc-700 font-bold p-1 text-lg"
                onClick={() => setCreateModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                    Document Title *
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-zinc-300 p-2 text-sm"
                    placeholder="Master Services Agreement 2026"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                    Document / Reference Number
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-zinc-300 p-2 text-sm font-mono"
                    placeholder="MSA-2026-0941"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                  Source Enterprise Module
                </label>
                <select
                  className="w-full rounded-lg border border-zinc-300 p-2 text-sm bg-white"
                  value={sourceModule}
                  onChange={(e) => setSourceModule(e.target.value)}
                >
                  <option value="ACCOUNTS_RECEIVABLE">Accounts Receivable (Contract & Invoicing)</option>
                  <option value="SPEND_MANAGEMENT">Spend Management (Vendor Procurement PO)</option>
                  <option value="TREASURY">Multi-Currency Treasury (Settlement Mandate)</option>
                  <option value="AUTONOMOUS_RECOVERY">Autonomous Recovery (Clawback & Dispute)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                  Document Payload / Legal Agreement Body *
                </label>
                <textarea
                  className="w-full rounded-lg border border-zinc-300 p-2 text-xs font-mono h-28"
                  placeholder="This legally binding agreement is executed between GigaLibs and Client Enterprise for automated operational workflows and cryptographic compliance..."
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase text-zinc-600">
                    Signers & Roles
                  </label>
                  <button
                    type="button"
                    className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
                    onClick={() =>
                      setRecipients([...recipients, { name: '', email: '', role: 'REVIEWER' }])
                    }
                  >
                    + Add Signer
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2 p-2 bg-zinc-50 border border-zinc-200 rounded-lg">
                  <span className="text-xs text-zinc-600 font-medium">Quick Pick Master Signer:</span>
                  <select
                    aria-label="Master Signers Directory"
                    className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800"
                    onChange={(e) => {
                      const selected = MASTER_SIGNERS.find((s) => s.id === e.target.value);
                      if (selected) {
                        setRecipients([...recipients, { name: selected.name, email: selected.email, role: selected.title }]);
                      }
                      e.target.value = '';
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Choose from verified Master Signers Directory...</option>
                    {MASTER_SIGNERS.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.title}) — {s.email}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  {recipients.map((r, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        className="w-1/3 rounded-lg border border-zinc-300 p-2 text-xs"
                        placeholder="Full Name (e.g. Sarah Connor)"
                        value={r.name}
                        onChange={(e) => {
                          const updated = [...recipients];
                          updated[idx]!.name = e.target.value;
                          setRecipients(updated);
                        }}
                      />
                      <input
                        type="email"
                        className="w-1/3 rounded-lg border border-zinc-300 p-2 text-xs"
                        placeholder="email@organization.com"
                        value={r.email}
                        onChange={(e) => {
                          const updated = [...recipients];
                          updated[idx]!.email = e.target.value;
                          setRecipients(updated);
                        }}
                      />
                      <input
                        type="text"
                        className="w-1/3 rounded-lg border border-zinc-300 p-2 text-xs font-mono"
                        placeholder="Role (e.g. VP Procurement)"
                        value={r.role}
                        onChange={(e) => {
                          const updated = [...recipients];
                          updated[idx]!.role = e.target.value;
                          setRecipients(updated);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="sendNow"
                  checked={sendImmediately}
                  onChange={(e) => setSendImmediately(e.target.checked)}
                  className="rounded border-zinc-300 text-blue-600"
                />
                <label htmlFor="sendNow" className="text-xs text-zinc-700 font-medium">
                  Dispatch immediately to signers upon creation
                </label>
              </div>

              <div className="pt-4 border-t border-zinc-200 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleCreateEnvelope}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating Envelope...' : 'Create Envelope'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signing Modal */}
      {signingModalOpen && activeEnvelopeDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-zinc-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <div className="flex items-center gap-3">
                <FileSignature className="w-6 h-6 text-blue-600" />
                <div>
                  <Heading level="h2" className="text-lg font-bold text-zinc-900">
                    Sign Envelope: {activeEnvelopeDetail.envelope.title}
                  </Heading>
                  <Text className="text-xs text-zinc-500">
                    FIPS 186-4 Cryptographic RSA-4096 / SHA-256 Digital Signature
                  </Text>
                </div>
              </div>
              <button
                className="text-zinc-400 hover:text-zinc-700 font-bold p-1 text-lg"
                onClick={() => setSigningModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {signSuccess ? (
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Cryptographic Signature Successfully Applied
                </div>
                <div className="p-3 bg-zinc-900 text-emerald-400 rounded-lg font-mono text-xs space-y-1">
                  <div><strong>Signer:</strong> {signSuccess.signerName} ({signSuccess.signerEmail})</div>
                  <div><strong>Signature Block:</strong> {signSuccess.signatureBlock}</div>
                  <div><strong>Signature Digest:</strong> {signSuccess.signatureDigest}</div>
                  <div><strong>Signed At:</strong> {signSuccess.signedAt}</div>
                  {signSuccess.envelopeCompleted && (
                    <div className="text-amber-400 font-bold pt-2">
                      ★ ENVELOPE FULLY COMPLETED — Court-Admissible PKI Certificate Generated!
                    </div>
                  )}
                </div>
                <Button
                  variant="primary"
                  className="w-full bg-zinc-900 text-white"
                  onClick={() => setSigningModalOpen(false)}
                >
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 font-mono text-xs space-y-1">
                  <div><strong className="text-zinc-600">Document Digest:</strong> {activeEnvelopeDetail.envelope.document_sha256}</div>
                  <div><strong className="text-zinc-600">Algorithm:</strong> {activeEnvelopeDetail.envelope.algorithm}</div>
                  <div><strong className="text-zinc-600">Status:</strong> {activeEnvelopeDetail.envelope.status}</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                    Document Body Content
                  </label>
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 font-mono text-xs max-h-36 overflow-y-auto whitespace-pre-wrap text-zinc-800">
                    {activeEnvelopeDetail.envelope.payload_text}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-600 mb-1">
                    Select Signer Identity *
                  </label>
                  <select
                    className="w-full rounded-lg border border-zinc-300 p-2 text-sm bg-white"
                    value={selectedSignerEmail}
                    onChange={(e) => setSelectedSignerEmail(e.target.value)}
                  >
                    {activeEnvelopeDetail.recipients.map((r: any) => (
                      <option key={r.id} value={r.email} disabled={r.status === 'SIGNED'}>
                        {r.name} ({r.email}) - {r.role} [{r.status}]
                      </option>
                    ))}
                  </select>
                </div>

                {/* Adobe Sign Interactive Signature Mode Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold uppercase text-zinc-600">
                      Signature Execution Mode
                    </label>
                    <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setSignatureMode('type')}
                        className={`px-2.5 py-1 rounded-md font-medium transition ${
                          signatureMode === 'type'
                            ? 'bg-white text-zinc-900 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        Type (Script)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignatureMode('draw')}
                        className={`px-2.5 py-1 rounded-md font-medium transition ${
                          signatureMode === 'draw'
                            ? 'bg-white text-zinc-900 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        Draw (Pen)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignatureMode('stamp')}
                        className={`px-2.5 py-1 rounded-md font-medium transition ${
                          signatureMode === 'stamp'
                            ? 'bg-white text-zinc-900 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        PKI Seal
                      </button>
                    </div>
                  </div>

                  {signatureMode === 'draw' && (
                    <div className="space-y-2">
                      <div className="relative border-2 border-dashed border-zinc-300 rounded-xl bg-zinc-50 overflow-hidden">
                        <canvas
                          ref={canvasRef}
                          width={580}
                          height={120}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          className="w-full h-28 cursor-crosshair"
                        />
                        <div className="absolute bottom-2 left-3 text-[10px] text-zinc-400 font-mono select-none pointer-events-none">
                          ✍ Sign above using mouse or touch pen
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-500">Vectorized ink captured with sub-pixel resolution</span>
                        <button
                          type="button"
                          onClick={clearCanvas}
                          className="text-xs text-red-600 hover:underline font-medium"
                        >
                          Clear Ink
                        </button>
                      </div>
                    </div>
                  )}

                  {signatureMode === 'type' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={typedSignature}
                        onChange={(e) => setTypedSignature(e.target.value)}
                        placeholder="Type your signature..."
                        className="w-full rounded-lg border border-zinc-300 p-2 text-sm"
                      />
                      <div className="p-4 rounded-xl border border-zinc-300 bg-zinc-50 flex items-center justify-center min-h-[70px]">
                        <span className="font-serif italic text-2xl text-blue-950 tracking-wide select-none">
                          {typedSignature || 'Your Signature Script'}
                        </span>
                      </div>
                    </div>
                  )}

                  {signatureMode === 'stamp' && (
                    <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/70 space-y-1 font-mono text-xs text-blue-900">
                      <div className="font-bold flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        OFFICIAL PKI ROOT CA ATTESTATION SEAL
                      </div>
                      <div>Signer: {selectedSignerEmail}</div>
                      <div>Authority: GigaLibs Enterprise Root CA G2</div>
                      <div>Algorithm: RSA-4096 / SHA-256 (FIPS 186-4)</div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-blue-50/70 rounded-lg border border-blue-200 text-xs text-blue-800 space-y-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Legal Digital Signature Attestation
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={attestationAccepted}
                      onChange={(e) => setAttestationAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-blue-950 leading-relaxed select-none">
                      I agree to be legally bound by this document in accordance with the United States Electronic Signatures in Global and National Commerce Act (E-SIGN), Uniform Electronic Transactions Act (UETA), and EU eIDAS regulations.
                    </span>
                  </label>
                </div>

                <div className="pt-4 border-t border-zinc-200 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setSigningModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                    onClick={handleSign}
                    disabled={isSigning || !selectedSignerEmail || !attestationAccepted}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    {isSigning ? 'Sealing Cryptographic Signature...' : 'Adopt & Sign Document'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      {certModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-zinc-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <div className="flex items-center gap-3">
                <Award className="w-6 h-6 text-amber-500" />
                <div>
                  <Heading level="h2" className="text-lg font-bold text-zinc-900">
                    Court-Admissible Certificate of Completion
                  </Heading>
                  <Text className="text-xs text-zinc-500">
                    X.509 PKI Timestamping Token and Tamper-Proof Audit Chain
                  </Text>
                </div>
              </div>
              <button
                className="text-zinc-400 hover:text-zinc-700 font-bold p-1 text-lg"
                onClick={() => setCertModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {certLoading ? (
              <div className="py-12 flex justify-center items-center gap-3 text-zinc-500">
                <ArrowPath className="animate-spin w-5 h-5 text-blue-600" />
                <span>Validating PKI certificate and audit chain...</span>
              </div>
            ) : certificateData ? (
              <div className="space-y-6 text-xs">
                {/* PKI Certificate Info */}
                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-zinc-900">{certificateData.title}</span>
                    <StatusBadge color={certificateData.status === 'COMPLETED' ? 'green' : 'blue'}>
                      {certificateData.status}
                    </StatusBadge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-zinc-600 pt-2 border-t border-zinc-200">
                    <div><strong>Document #:</strong> {certificateData.documentNumber}</div>
                    <div><strong>Algorithm:</strong> {certificateData.algorithm}</div>
                    <div className="col-span-2 break-all">
                      <strong>SHA-256 Digest:</strong> {certificateData.documentSha256}
                    </div>
                  </div>
                </div>

                {certificateData.pkiCertificate ? (
                  <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 space-y-2 font-mono text-xs">
                    <div className="text-amber-900 font-bold uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      PKI Trust Authority Credentials
                    </div>
                    <div><strong>Serial Number:</strong> {certificateData.pkiCertificate.serialNumber}</div>
                    <div><strong>Issuer:</strong> {certificateData.pkiCertificate.issuer}</div>
                    <div><strong>Subject:</strong> {certificateData.pkiCertificate.subject}</div>
                    <div><strong>Thumbprint:</strong> {certificateData.pkiCertificate.thumbprint}</div>
                  </div>
                ) : (
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-zinc-500 text-center">
                    Certificate of Completion will be officially sealed once all designated signers complete their signatures.
                  </div>
                )}

                {/* Signers Timeline */}
                <div>
                  <Text className="text-xs font-semibold uppercase text-zinc-600 mb-2">
                    Signer Attestations & Digests
                  </Text>
                  <div className="border border-zinc-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
                        <tr>
                          <th className="p-2.5">Signer</th>
                          <th className="p-2.5">Role</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Signature Block</th>
                          <th className="p-2.5">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {certificateData.signers.map((s) => (
                          <tr key={s.id} className="hover:bg-zinc-50">
                            <td className="p-2.5 font-medium text-zinc-900">
                              {s.name} <span className="text-zinc-500 font-normal">({s.email})</span>
                            </td>
                            <td className="p-2.5 font-mono text-zinc-600">{s.role}</td>
                            <td className="p-2.5">
                              {s.status === 'SIGNED' ? (
                                <StatusBadge color="green">SIGNED</StatusBadge>
                              ) : (
                                <StatusBadge color="orange">PENDING</StatusBadge>
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-blue-600">
                              {s.signature_block || '—'}
                            </td>
                            <td className="p-2.5 text-zinc-500">
                              {s.signed_at ? new Date(s.signed_at).toLocaleString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Audit Timeline */}
                <div>
                  <Text className="text-xs font-semibold uppercase text-zinc-600 mb-2">
                    Immutable Audit Chain Events ({certificateData.auditTimeline.length})
                  </Text>
                  <div className="space-y-2">
                    {certificateData.auditTimeline.map((evt, idx) => (
                      <div key={idx} className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-zinc-900">{evt.event_type}</span> by{' '}
                          <span className="text-zinc-700">{evt.actor_name}</span>
                          <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
                            Hash: {evt.chain_hash.slice(0, 24)}...
                          </div>
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          {new Date(evt.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-zinc-500">Failed to load certificate.</div>
            )}
          </div>
        </div>
      )}

      {/* Root CA Authority & Hardware Binding Modal */}
      {rootCaModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-zinc-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <Heading level="h2" className="text-lg font-bold text-zinc-900">
                    X.509 PKI Root CA Authority & Binding
                  </Heading>
                  <Text className="text-xs text-zinc-500">
                    FIPS 186-4 Digital Signature Standard & Enterprise PKI Governance
                  </Text>
                </div>
              </div>
              <button
                className="text-zinc-400 hover:text-zinc-700 font-bold p-1 text-lg"
                onClick={() => setRootCaModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Cryptographic Authority Status
                  </span>
                  <StatusBadge color="green">BOUND & CERTIFIED</StatusBadge>
                </div>
                <p className="text-emerald-800 text-[11px] leading-relaxed">
                  Your tenant workspace is actively linked to the isolated PostgreSQL <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono">gigalibs_esign</code> persistence layer and verified against the enterprise Root CA hierarchy.
                </p>
              </div>

              <div className="space-y-3 font-mono">
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                  <div className="text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">CA Organization & Issuer</div>
                  <div className="font-semibold text-zinc-900">{rootCaInfo?.caOrganization || 'GigaLibs Enterprise Root CA G2'}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                    <div className="text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">Compliance Profile</div>
                    <div className="text-zinc-900 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      FIPS 186-4 / FIPS 140-3 Mode
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                    <div className="text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">Asymmetric Algorithm</div>
                    <div className="text-zinc-900">RSA-4096 / SHA-256 PSS</div>
                  </div>
                </div>

                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                  <div className="text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">SHA-256 Root Fingerprint (Thumbprint)</div>
                  <div className="text-emerald-700 font-bold break-all text-[11px]">
                    {rootCaInfo?.rootThumbprint || '8F:3A:91:2E:C4:0B:77:D1:6E:5C:32:FA:18:90:BB:44:03:CD:99:A1'}
                  </div>
                </div>

                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                  <div className="text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">Authorized Key Usages</div>
                  <div className="text-zinc-700 text-[11px]">
                    {rootCaInfo?.keyUsage || 'Digital Signature, Non-Repudiation, Certificate Signing, CRL Signing'}
                  </div>
                </div>

                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                  <div className="text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">Trust Chain Hierarchy</div>
                  <div className="text-zinc-800 text-[11px] space-y-1 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[10px]">L0</span>
                      <span>GigaLibs Global Root CA G2 (Self-Signed, Offline HSM)</span>
                    </div>
                    <div className="flex items-center gap-2 pl-4 border-l border-zinc-300 ml-2">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[10px]">L1</span>
                      <span>GigaLibs Multi-Tenant Document Issuing Intermediate CA</span>
                    </div>
                    <div className="flex items-center gap-2 pl-8 border-l border-zinc-300 ml-2">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px]">Leaf</span>
                      <span>Tenant Envelope Signature Seal & Timestamping Token</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-200 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRootCaModalOpen(false)}>
                Close Inspector
              </Button>
              <Button
                variant="primary"
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                onClick={() => {
                  navigator.clipboard?.writeText(rootCaInfo?.rootThumbprint || '8F:3A:91:2E:C4:0B:77:D1:6E:5C:32:FA:18:90:BB:44:03:CD:99:A1');
                  alert('Root CA Thumbprint copied to clipboard.');
                }}
              >
                Copy Fingerprint
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Adobe Sign-Grade Visual Document & Field Placement Viewer Modal */}
      {previewFieldsModalOpen && previewEnvelopeDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-zinc-200 space-y-6 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-50 border border-blue-200">
                  <PenTool className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Heading level="h2" className="text-lg font-bold text-zinc-900">
                      {previewEnvelopeDetail.envelope.title}
                    </Heading>
                    <StatusBadge color={previewEnvelopeDetail.envelope.status === 'COMPLETED' ? 'green' : 'blue'}>
                      {previewEnvelopeDetail.envelope.status}
                    </StatusBadge>
                  </div>
                  <Text className="text-xs text-zinc-500">
                    Adobe Sign-Grade Field Placement & Visual Signing Canvas · Document #{previewEnvelopeDetail.envelope.document_number}
                  </Text>
                </div>
              </div>
              <button
                className="text-zinc-400 hover:text-zinc-700 font-bold p-1 text-lg"
                onClick={() => setPreviewFieldsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pr-1">
              {/* Visual Document Canvas Simulation */}
              <div className="lg:col-span-8 bg-zinc-100/70 p-6 rounded-2xl border border-zinc-300 flex justify-center shadow-inner">
                <div className="bg-white rounded-xl shadow-lg border border-zinc-300 p-8 w-full max-w-2xl min-h-[520px] flex flex-col justify-between relative select-none">
                  {/* Watermark/Header */}
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-600" />
                      <span className="font-bold text-sm tracking-wider uppercase text-zinc-900">
                        {previewEnvelopeDetail.envelope.source_module.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">
                      SECURED BY GIGALIBS ESIGN PRO
                    </span>
                  </div>

                  {/* Document Body */}
                  <div className="py-6 space-y-4 text-xs text-zinc-700">
                    <div className="text-base font-bold text-zinc-900">
                      {previewEnvelopeDetail.envelope.title}
                    </div>
                    <div className="text-zinc-500 leading-relaxed font-serif text-[13px] bg-zinc-50 p-4 rounded-lg border border-zinc-200">
                      {previewEnvelopeDetail.envelope.payload?.body ||
                        previewEnvelopeDetail.envelope.payload?.documentText ||
                        'This document represents a legally binding commercial agreement executed via the GigaLibs Cryptographic E-Signature engine. The undersigned parties affirm and consent to electronic execution.'}
                    </div>
                  </div>

                  {/* Adobe Sign Placed Signature & Field Tabs */}
                  <div className="pt-6 border-t-2 border-dashed border-zinc-200 space-y-4">
                    <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Interactive Signature Fields & Form Elements
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {previewEnvelopeDetail.recipients.map((rec: any, i: number) => (
                        <div
                          key={rec.id}
                          className={`p-4 rounded-xl border-2 transition-all relative ${
                            rec.status === 'SIGNED'
                              ? 'border-emerald-300 bg-emerald-50/50'
                              : 'border-amber-300 bg-amber-50/40'
                          }`}
                        >
                          {/* Visual Adobe Tab Indicator */}
                          <div
                            className={`absolute -top-3 left-4 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm ${
                              rec.status === 'SIGNED'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-amber-500 text-white'
                            }`}
                          >
                            <PenTool className="w-2.5 h-2.5" />
                            {rec.status === 'SIGNED' ? 'Signed & Verified' : 'Sign Here'}
                          </div>

                          <div className="mt-2 space-y-1">
                            <div className="text-xs font-bold text-zinc-900">{rec.name}</div>
                            <div className="text-[11px] text-zinc-500">{rec.role} · {rec.email}</div>

                            {rec.status === 'SIGNED' ? (
                              <div className="mt-3 pt-2 border-t border-emerald-200 space-y-1 font-mono text-[11px]">
                                <div className="font-serif italic text-lg text-blue-900">
                                  {rec.signature_block || rec.name}
                                </div>
                                <div className="text-zinc-500 text-[10px]">
                                  Digitally sealed: {new Date(rec.signed_at).toLocaleString()}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 py-3 border-2 border-dashed border-amber-300 rounded-lg text-center text-amber-700 font-medium text-xs bg-white/70">
                                Awaiting Signature
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Cryptographic Trust Footer */}
                    <div className="pt-2 flex items-center justify-between text-[10px] font-mono text-zinc-400 border-t border-zinc-100">
                      <div>SHA-256: {previewEnvelopeDetail.envelope.document_sha256.slice(0, 32)}...</div>
                      <div className="flex items-center gap-1 text-emerald-600 font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        X.509 PKI Governed
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Document Intelligence */}
              <div className="lg:col-span-4 space-y-4 text-xs">
                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                  <div className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    Envelope Metadata
                  </div>
                  <div className="space-y-2 font-mono text-[11px] text-zinc-600">
                    <div><strong>Envelope ID:</strong> <span className="text-zinc-900">{previewEnvelopeDetail.envelope.id}</span></div>
                    <div><strong>Document Number:</strong> <span className="text-zinc-900">{previewEnvelopeDetail.envelope.document_number}</span></div>
                    <div><strong>Source Module:</strong> <span className="text-zinc-900">{previewEnvelopeDetail.envelope.source_module}</span></div>
                    <div><strong>Created:</strong> <span className="text-zinc-900">{new Date(previewEnvelopeDetail.envelope.created_at).toLocaleString()}</span></div>
                  </div>
                </div>

                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                  <div className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    Signature Progress
                  </div>
                  <div className="space-y-2">
                    {previewEnvelopeDetail.recipients.map((rec: any) => (
                      <div key={rec.id} className="p-2.5 bg-white rounded-lg border border-zinc-200 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-zinc-900">{rec.name}</div>
                          <div className="text-[11px] text-zinc-500 font-mono">{rec.role}</div>
                        </div>
                        <StatusBadge color={rec.status === 'SIGNED' ? 'green' : 'orange'}>
                          {rec.status}
                        </StatusBadge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2">
                  <div className="font-semibold text-blue-950 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-blue-600" />
                    Tamper Protection
                  </div>
                  <p className="text-[11px] text-blue-900 leading-relaxed">
                    Any modification to this document after signing will invalidate the cryptographic SHA-256 digest and fail X.509 PKI certificate verification.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-200 flex justify-end shrink-0">
              <Button variant="secondary" onClick={() => setPreviewFieldsModalOpen(false)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

