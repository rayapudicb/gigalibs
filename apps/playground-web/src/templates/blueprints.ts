import { Node, Edge } from '@xyflow/react';
import { WorkflowNodeData } from '../components/WorkflowStudioCanvas';

export interface EnterpriseBlueprint {
  id: string;
  name: string;
  category: string;
  description: string;
  badge: string;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
}

export const ENTERPRISE_BLUEPRINTS: EnterpriseBlueprint[] = [
  {
    id: 'bp_invoice_flow',
    name: '1. Invoice Intelligence & Double-Entry Ledger Commit',
    category: 'Finance & Compliance',
    badge: '8 STAGES • ACID LEDGER',
    description: 'Ingest invoice PDF via webhook, parse line items with @gigalibs/ocr-core, match vendor contract in Brain, score fraud risk, request CFO signoff, and commit balanced double-entry ledger.',
    nodes: [
      {
        id: 'n1_trigger',
        type: 'customNode',
        position: { x: 50, y: 220 },
        data: { label: 'Inbound Invoice Webhook', category: 'trigger', status: 'idle', config: { detail: '/api/v1/inbound/invoices' }, credits: 0 },
      },
      {
        id: 'n2_ocr',
        type: 'customNode',
        position: { x: 380, y: 100 },
        data: { label: 'GigaLibs OCR Processor', category: 'module_ocr', status: 'idle', config: { detail: '@gigalibs/document-ocr-core' }, credits: 200 },
      },
      {
        id: 'n3_brain',
        type: 'customNode',
        position: { x: 380, y: 320 },
        data: { label: 'Vendor Contracts Brain', category: 'module_brain', status: 'idle', config: { detail: 'pgvector source: vendor_msas' }, credits: 150 },
      },
      {
        id: 'n4_llm',
        type: 'customNode',
        position: { x: 720, y: 100 },
        data: { label: 'Claude 3.5 Sonnet Tax Extraction', category: 'llm', status: 'idle', config: { detail: 'model: claude-3-5-sonnet' }, credits: 800 },
      },
      {
        id: 'n5_fraud',
        type: 'customNode',
        position: { x: 720, y: 320 },
        data: { label: 'GigaLibs Fraud Engine', category: 'module_fraud', status: 'idle', config: { detail: '@gigalibs/fraud-detection (0-100 score)' }, credits: 100 },
      },
      {
        id: 'n6_approval',
        type: 'customNode',
        position: { x: 1060, y: 210 },
        data: { label: 'CFO Governance Approval Gate', category: 'approval', status: 'idle', config: { detail: 'Mandatory if amount > $10,000' }, credits: 0 },
      },
      {
        id: 'n7_ledger',
        type: 'customNode',
        position: { x: 1400, y: 120 },
        data: { label: 'GigaLibs Double-Entry Ledger', category: 'module_ledger', status: 'idle', config: { detail: '@gigalibs/ledger (ACID Debit/Credit)' }, credits: 50 },
      },
      {
        id: 'n8_erp',
        type: 'customNode',
        position: { x: 1400, y: 320 },
        data: { label: 'Post to Enterprise ERP', category: 'http', status: 'idle', config: { detail: 'https://erp.internal/api/v1/invoices' }, credits: 50 },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1_trigger', target: 'n2_ocr', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1_trigger', target: 'n3_brain', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2_ocr', target: 'n4_llm', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e3-5', source: 'n3_brain', target: 'n5_fraud', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e4-6', source: 'n4_llm', target: 'n6_approval', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e5-6', source: 'n5_fraud', target: 'n6_approval', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e6-7', source: 'n6_approval', target: 'n7_ledger', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e6-8', source: 'n6_approval', target: 'n8_erp', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'bp_vendor_onboarding',
    name: '2. Vendor Compliance, Geofence Check & E-Signature',
    category: 'Legal & Procurement',
    badge: '6 STAGES • PKI E-SIGN',
    description: 'Dynamic Form submission triggers Haversine geographic boundary calculation, KYC fraud scoring, contract synthesis, and X.509 cryptographic E-Signature sealing.',
    nodes: [
      {
        id: 'n1_trigger',
        type: 'customNode',
        position: { x: 50, y: 200 },
        data: { label: 'Dynamic Form Submission', category: 'trigger', status: 'idle', config: { detail: '@gigalibs/form-engine-react' }, credits: 0 },
      },
      {
        id: 'n2_maps',
        type: 'customNode',
        position: { x: 380, y: 100 },
        data: { label: 'Haversine Geofence Boundary', category: 'trigger', status: 'idle', config: { detail: '@gigalibs/maps-core (radius: 5000km)' }, credits: 50 },
      },
      {
        id: 'n3_fraud',
        type: 'customNode',
        position: { x: 380, y: 300 },
        data: { label: 'Vendor Risk & IP Heuristics', category: 'module_fraud', status: 'idle', config: { detail: '@gigalibs/fraud-detection' }, credits: 100 },
      },
      {
        id: 'n4_llm',
        type: 'customNode',
        position: { x: 740, y: 200 },
        data: { label: 'Contract Clause Generator', category: 'llm', status: 'idle', config: { detail: 'model: gpt-4o-2024-11-20' }, credits: 600 },
      },
      {
        id: 'n5_esign',
        type: 'customNode',
        position: { x: 1100, y: 200 },
        data: { label: 'Cryptographic E-Sign Envelope', category: 'module_esign', status: 'idle', config: { detail: '@gigalibs/esign-core (SHA-256 Seal)' }, credits: 250 },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1_trigger', target: 'n2_maps', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1_trigger', target: 'n3_fraud', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2_maps', target: 'n4_llm', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3_fraud', target: 'n4_llm', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e4-5', source: 'n4_llm', target: 'n5_esign', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'bp_support_triage',
    name: '3. Customer Support SLA Triage & 2-Way Chat Alert',
    category: 'Customer Ops',
    badge: '5 STAGES • REALTIME CHAT',
    description: 'Inbound customer ticket analyzed by Brain knowledge base, categorized by AI priority classifier, and dispatched to WebSocket team chat channels with 15m SLA.',
    nodes: [
      {
        id: 'n1_trigger',
        type: 'customNode',
        position: { x: 50, y: 200 },
        data: { label: 'Customer Ticket Ingest', category: 'trigger', status: 'idle', config: { detail: 'Priority: URGENT (15m SLA)' }, credits: 0 },
      },
      {
        id: 'n2_brain',
        type: 'customNode',
        position: { x: 400, y: 120 },
        data: { label: 'GigaCRM Product Docs RAG', category: 'module_brain', status: 'idle', config: { detail: 'source: support_sops_kb' }, credits: 150 },
      },
      {
        id: 'n3_llm',
        type: 'customNode',
        position: { x: 400, y: 300 },
        data: { label: 'AI Resolution Drafter', category: 'llm', status: 'idle', config: { detail: 'model: claude-3-5-sonnet' }, credits: 700 },
      },
      {
        id: 'n4_approval',
        type: 'customNode',
        position: { x: 780, y: 200 },
        data: { label: 'Support Lead Signoff', category: 'approval', status: 'idle', config: { detail: 'Agent: Sarah Connor' }, credits: 0 },
      },
      {
        id: 'n5_chat',
        type: 'customNode',
        position: { x: 1140, y: 200 },
        data: { label: '2-Way Team Chat Broadcast', category: 'http', status: 'idle', config: { detail: '@gigalibs/chat-react (#ops-escalations)' }, credits: 50 },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'n1_trigger', target: 'n2_brain', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1_trigger', target: 'n3_llm', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2_brain', target: 'n4_approval', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3_llm', target: 'n4_approval', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e4-5', source: 'n4_approval', target: 'n5_chat', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
];
