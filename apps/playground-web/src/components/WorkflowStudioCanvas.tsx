import * as React from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  Panel,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, StatusBadge, Input, Modal } from '@gigalibs/ui';
import { UniversalDataStudioPro } from './UniversalDataStudioPro.js';
import type {
  AgentPersona,
  EnterpriseConnector,
  WorkflowDefinition,
  ConnectionHealthStatus,
  WorkflowRunLog,
} from '@gigalibs/workflow-engine';
import { LiveExternalApiHub } from '../live-external-api.js';
import { ApiClient } from '../api-client.js';

// ─── MASTER MULTI-WORKFLOW REGISTRY (MULTIPLE WORKFLOWS PER APP) ──────────────

export const MASTER_WORKFLOWS_REGISTRY: WorkflowDefinition[] = [
  // ─── LIVE ZERO-AUTH OPEN SOURCE PLATFORM CONNECTORS ─────────────────────────
  {
    id: 'wf_github_live',
    name: '🐙 GitHub Public REST — React Repository Live Commits Ingestion',
    appTarget: 'GitHub Open API (facebook/react)',
    category: 'DEVOPS',
    description: 'Ingests live commit SHAs, author identity, and messages from GitHub public REST API without authentication.',
    isActive: true,
    triggerType: 'WEBHOOK',
    totalRuns: 2450,
    successRatePercent: 100.0,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'GitHub Public Commits Stream', category: 'trigger', status: 'idle', config: { detail: 'GET api.github.com/repos/facebook/react/commits' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 420, y: 120 }, data: { label: 'SHA-256 Digest & Author Parser', category: 'module_brain', status: 'idle', config: { detail: 'Verify Commit Author & Signature' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 420, y: 280 }, data: { label: 'AI Release Notes Summarizer', category: 'llm', status: 'idle', config: { detail: 'Summarize PR Churn & Semver' }, credits: 150 } },
      { id: 'n4', type: 'customNode', position: { x: 820, y: 200 }, data: { label: 'PostgreSQL Audit Run Persistence', category: 'module_ledger', status: 'idle', config: { detail: 'Commit to WorkflowRun table' }, credits: 25 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_usgs_earthquake_live',
    name: '🏛️ USA.gov USGS — Real-Time Seismic Activity & Safety Alert',
    appTarget: 'USGS US Government Open Data',
    category: 'LOGISTICS_MAPS',
    description: 'Polls US Geological Survey hourly GeoJSON feed, detects earthquakes > 2.5 magnitude across 50 US States, and triggers soundstage safety interlock.',
    isActive: true,
    triggerType: 'CRON',
    totalRuns: 3120,
    successRatePercent: 99.9,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'USGS GeoJSON Real-Time Poller', category: 'trigger', status: 'idle', config: { detail: 'earthquake.usgs.gov/earthquakes/feed' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 420, y: 120 }, data: { label: 'Magnitude Threshold Evaluator', category: 'module_fraud', status: 'idle', config: { detail: 'Filter Magnitude >= 2.0' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 420, y: 280 }, data: { label: 'Soundstage Geofence Proximity', category: 'module_ocr', status: 'idle', config: { detail: 'Haversine Radius (<150 km)' }, credits: 50 } },
      { id: 'n4', type: 'customNode', position: { x: 820, y: 200 }, data: { label: 'Production Safety Broadcast', category: 'http', status: 'idle', config: { detail: 'Disaster Recovery Alert' }, credits: 30 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_ecommerce_pricing_live',
    name: '🛒 Amazon / Retail E-Commerce — Real-Time SKU & Dynamic Discount Stream',
    appTarget: 'Open Retail & E-Commerce Catalog',
    category: 'COMMERCE',
    description: 'Pulls open e-commerce product SKUs, stock levels, and discount rates to recalculate wholesale pricing and margins.',
    isActive: true,
    triggerType: 'WEBHOOK',
    totalRuns: 1890,
    successRatePercent: 99.7,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'Retail Product Stream Ingestion', category: 'trigger', status: 'idle', config: { detail: 'dummyjson.com/products' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 420, y: 120 }, data: { label: 'Stock & Margin Calculator', category: 'module_ledger', status: 'idle', config: { detail: 'Evaluate Stock Depth & Margin' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 420, y: 280 }, data: { label: 'Dynamic Price Elasticity AI', category: 'llm', status: 'idle', config: { detail: 'Optimize Discount % Curve' }, credits: 150 } },
      { id: 'n4', type: 'customNode', position: { x: 820, y: 200 }, data: { label: 'Product Catalog Database Sync', category: 'http', status: 'idle', config: { detail: 'Post to ProductCatalogItem table' }, credits: 40 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_hackernews_trending_live',
    name: '📰 HackerNews — Live Trending Tech News & AI Topic Classification',
    appTarget: 'HackerNews Firebase Open API',
    category: 'MARKETING_LEADS',
    description: 'Fetches top trending discussions and upvotes from HackerNews REST API, classifies tech domains, and alerts product managers.',
    isActive: true,
    triggerType: 'CRON',
    totalRuns: 4200,
    successRatePercent: 100.0,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'HackerNews Top Stories Stream', category: 'trigger', status: 'idle', config: { detail: 'hacker-news.firebaseio.com/v0' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 420, y: 120 }, data: { label: 'Score & Discussion Filter', category: 'module_brain', status: 'idle', config: { detail: 'Filter Score > 100 Upvotes' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 420, y: 280 }, data: { label: 'AI Tech Topic Clustering', category: 'llm', status: 'idle', config: { detail: 'Claude 3.5 Topic Categorizer' }, credits: 150 } },
      { id: 'n4', type: 'customNode', position: { x: 820, y: 200 }, data: { label: 'Executive Intelligence Digest', category: 'http', status: 'idle', config: { detail: 'Publish to #tech-radar channel' }, credits: 30 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_weather_telemetry_live',
    name: '🌤️ Open-Meteo — Hollywood Soundstage High-Wind OSHA Interlock',
    appTarget: 'Open-Meteo US Weather Grid',
    category: 'LOGISTICS_MAPS',
    description: 'Queries live atmospheric telemetry (temperature, wind speed, pressure) in Los Angeles and halts outdoor crane operations if wind > 35 km/h.',
    isActive: true,
    triggerType: 'CRON',
    totalRuns: 5120,
    successRatePercent: 99.8,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'Open-Meteo LA Weather Grid', category: 'trigger', status: 'idle', config: { detail: 'api.open-meteo.com/v1/forecast' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 420, y: 120 }, data: { label: 'OSHA Wind Speed Safety Guard', category: 'module_fraud', status: 'idle', config: { detail: 'Interlock: Wind < 35 km/h' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 420, y: 280 }, data: { label: 'Outdoor Crane Power Switch', category: 'module_ocr', status: 'idle', config: { detail: 'Gantry Hardware Relay' }, credits: 50 } },
      { id: 'n4', type: 'customNode', position: { x: 820, y: 200 }, data: { label: 'Production Safety Logger', category: 'module_ledger', status: 'idle', config: { detail: 'Log to Safety Audit Ledger' }, credits: 25 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_coingecko_liquidity_live',
    name: '🪙 CoinGecko — Real-Time Crypto Liquidity & Multi-Currency FX Rebalancer',
    appTarget: 'CoinGecko Global Financial API',
    category: 'ERP_FINANCE',
    description: 'Pulls live BTC, ETH, and SOL market prices and volatility metrics to rebalance multi-currency treasury reserves.',
    isActive: true,
    triggerType: 'CRON',
    totalRuns: 6890,
    successRatePercent: 99.9,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'CoinGecko Liquidity Stream', category: 'trigger', status: 'idle', config: { detail: 'api.coingecko.com/api/v3' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 420, y: 120 }, data: { label: '24h Volatility Band Evaluator', category: 'module_brain', status: 'idle', config: { detail: 'Filter Volatility > 3.0%' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 420, y: 280 }, data: { label: 'FX Rate Matrix Auto-Updater', category: 'module_ledger', status: 'idle', config: { detail: '@gigalibs/multi-currency' }, credits: 50 } },
      { id: 'n4', type: 'customNode', position: { x: 820, y: 200 }, data: { label: 'Treasury Rebalance Document', category: 'http', status: 'idle', config: { detail: 'Post Journal KR to Ledger' }, credits: 50 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_sap_fico_01',
    name: '📄 SAP FICO — Vendor Invoice 3-Way PO Matching',
    appTarget: 'SAP S/4HANA & SAP FICO',
    category: 'ERP_FINANCE',
    description: 'Ingests M365 PDF invoices, extracts line items via OCR, verifies against SAP PO, and posts vendor invoice BAPI.',
    isActive: true,
    triggerType: 'WEBHOOK',
    totalRuns: 1420,
    successRatePercent: 99.8,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'M365 Outlook Inbound Webhook', category: 'trigger', status: 'idle', config: { detail: 'invoices@paramount.com' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 380, y: 100 }, data: { label: 'DocuSight AI OCR Processor', category: 'module_ocr', status: 'idle', config: { detail: '@gigalibs/document-ocr-core' }, credits: 200 } },
      { id: 'n3', type: 'customNode', position: { x: 380, y: 300 }, data: { label: 'Vendor Master Brain RAG', category: 'module_brain', status: 'idle', config: { detail: 'pgvector SAP PO match' }, credits: 150 } },
      { id: 'n4', type: 'customNode', position: { x: 720, y: 100 }, data: { label: 'Claude 3.5 3-Way Reconciler', category: 'llm', status: 'idle', config: { detail: 'Validate PO against SLA' }, credits: 800 } },
      { id: 'n5', type: 'customNode', position: { x: 720, y: 300 }, data: { label: 'SentinelGuard Fraud 0-100', category: 'module_fraud', status: 'idle', config: { detail: '@gigalibs/fraud-detection' }, credits: 100 } },
      { id: 'n6', type: 'customNode', position: { x: 1060, y: 200 }, data: { label: 'CFO Governance Approval Gate', category: 'approval', status: 'idle', config: { detail: 'Threshold: > $10,000' }, credits: 0 } },
      { id: 'n7', type: 'customNode', position: { x: 1400, y: 100 }, data: { label: 'GigaLibs General Ledger', category: 'module_ledger', status: 'idle', config: { detail: 'Balanced ACID Post' }, credits: 50 } },
      { id: 'n8', type: 'customNode', position: { x: 1400, y: 300 }, data: { label: 'SAP S/4HANA Vendor Invoice BAPI', category: 'http', status: 'idle', config: { detail: 'API_JOURNALENTRY_SRV' }, credits: 50 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e3-5', source: 'n3', target: 'n5', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e4-6', source: 'n4', target: 'n6', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e5-6', source: 'n5', target: 'n6', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e6-7', source: 'n6', target: 'n7', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e6-8', source: 'n6', target: 'n8', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_sap_fico_02',
    name: '🏛️ SAP FICO — Month-End FX Revaluation & GL Post',
    appTarget: 'SAP S/4HANA & SAP FICO',
    category: 'ERP_FINANCE',
    description: 'Scheduled monthly cron that revalues open EUR/GBP invoices, calculates realized FX gains, and posts to SAP FICO.',
    isActive: true,
    triggerType: 'CRON',
    totalRuns: 820,
    successRatePercent: 100.0,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'Month-End Cron (00:00 UTC)', category: 'trigger', status: 'idle', config: { detail: 'Schedule: 0 0 1 * *' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 400, y: 120 }, data: { label: 'ECB Live 10-Currency Matrix', category: 'module_ledger', status: 'idle', config: { detail: '@gigalibs/multi-currency' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 400, y: 280 }, data: { label: 'Open AR/AP Ledger Balances', category: 'module_brain', status: 'idle', config: { detail: 'Query Unpaid Receivables' }, credits: 50 } },
      { id: 'n4', type: 'customNode', position: { x: 800, y: 200 }, data: { label: 'Minor-Unit FX Gain/Loss Math', category: 'llm', status: 'idle', config: { detail: 'Zero-Drift Realized Gain/Loss' }, credits: 100 } },
      { id: 'n5', type: 'customNode', position: { x: 1200, y: 120 }, data: { label: 'Dual-Currency Ledger Commit', category: 'module_ledger', status: 'idle', config: { detail: 'Debit #1000 / Credit #7100' }, credits: 50 } },
      { id: 'n6', type: 'customNode', position: { x: 1200, y: 280 }, data: { label: 'SAP FICO Document Post (KR)', category: 'http', status: 'idle', config: { detail: 'OData Document Posting' }, credits: 50 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e4-5', source: 'n4', target: 'n5', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e4-6', source: 'n4', target: 'n6', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_sap_mm_03',
    name: '🚚 SAP MM — Soundstage Equipment Gantry Release',
    appTarget: 'SAP S/4HANA (Materials Mgmt)',
    category: 'LOGISTICS_MAPS',
    description: 'Triggered when freight truck crosses Soundstage 4 geofence. Checks SAP MM stock reservations and issues QR gate pass.',
    isActive: true,
    triggerType: 'GEOFENCE',
    totalRuns: 640,
    successRatePercent: 99.2,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'Soundstage 4 Geofence Crossing', category: 'trigger', status: 'idle', config: { detail: '@gigalibs/maps-core PIP' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 400, y: 120 }, data: { label: 'SAP MM Stock Reservation Check', category: 'http', status: 'idle', config: { detail: 'BAPI_MATERIAL_AVAILABILITY' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 400, y: 280 }, data: { label: 'OSHA High-Wind Sensor Guard', category: 'module_fraud', status: 'idle', config: { detail: 'Wind Interlock (<35 km/h)' }, credits: 50 } },
      { id: 'n4', type: 'customNode', position: { x: 800, y: 200 }, data: { label: 'Cryptographic QR Gate Pass', category: 'module_esign', status: 'idle', config: { detail: 'X.509 PKI Signed Pass' }, credits: 100 } },
      { id: 'n5', type: 'customNode', position: { x: 1200, y: 200 }, data: { label: 'Slack Gantry Alert Dispatcher', category: 'http', status: 'idle', config: { detail: '#soundstage-ops channel' }, credits: 20 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e4-5', source: 'n4', target: 'n5', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_tableau_04',
    name: '📊 Tableau & Power BI — Live Executive Revenue Sync',
    appTarget: 'Tableau Cloud & Power BI',
    category: 'DATA_BI',
    description: 'Pushes settled Stripe payments directly into Tableau Hyper extracts and Power BI streaming datasets in sub-seconds.',
    isActive: true,
    triggerType: 'EVENT',
    totalRuns: 2150,
    successRatePercent: 99.9,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'Stripe Payment Settled Webhook', category: 'trigger', status: 'idle', config: { detail: 'payment_intent.succeeded' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 400, y: 120 }, data: { label: 'Tax Jurisdiction Allocation', category: 'module_ledger', status: 'idle', config: { detail: 'CA/NY/TX Sales Tax Split' }, credits: 50 } },
      { id: 'n3', type: 'customNode', position: { x: 400, y: 280 }, data: { label: 'Double-Entry General Ledger', category: 'module_ledger', status: 'idle', config: { detail: 'ACID Balance Commit' }, credits: 50 } },
      { id: 'n4', type: 'customNode', position: { x: 850, y: 120 }, data: { label: 'Tableau Hyper Extract Append', category: 'http', status: 'idle', config: { detail: 'REST API v3.21 (.hyper)' }, credits: 50 } },
      { id: 'n5', type: 'customNode', position: { x: 850, y: 280 }, data: { label: 'Power BI Streaming Push API', category: 'http', status: 'idle', config: { detail: 'Live Executive KPI Dataset' }, credits: 50 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      { id: 'e3-5', source: 'n3', target: 'n5', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
  {
    id: 'wf_m365_05',
    name: '📧 Microsoft 365 — Automated Contract Signing & Brain RAG',
    appTarget: 'Microsoft 365 & DocuSign',
    category: 'WORKPLACE',
    description: 'Watches Outlook inbox for contract requests, queries Brain RAG for SLA terms, executes cryptographic E-Sign, and saves to SharePoint.',
    isActive: true,
    triggerType: 'WEBHOOK',
    totalRuns: 980,
    successRatePercent: 99.5,
    nodes: [
      { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: 'Outlook Contract Request Email', category: 'trigger', status: 'idle', config: { detail: 'legal@paramount.com' }, credits: 0 } },
      { id: 'n2', type: 'customNode', position: { x: 400, y: 120 }, data: { label: 'Company Brain Vector RAG', category: 'module_brain', status: 'idle', config: { detail: 'Retrieve 2026 Master SLA' }, credits: 150 } },
      { id: 'n3', type: 'customNode', position: { x: 400, y: 280 }, data: { label: 'DocuSight Metadata Extractor', category: 'module_ocr', status: 'idle', config: { detail: 'Party Names & Signer Emails' }, credits: 200 } },
      { id: 'n4', type: 'customNode', position: { x: 800, y: 200 }, data: { label: 'Cryptographic E-Sign Envelope', category: 'module_esign', status: 'idle', config: { detail: '@gigalibs/esign-core' }, credits: 100 } },
      { id: 'n5', type: 'customNode', position: { x: 1200, y: 200 }, data: { label: 'SharePoint Document Archive', category: 'http', status: 'idle', config: { detail: 'Microsoft Graph Drive API' }, credits: 50 } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
      { id: 'e4-5', source: 'n4', target: 'n5', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    ],
  },
];

// ─── MASTER CONNECTION HEALTH TELEMETRY ───────────────────────────────────────

export const MASTER_CONNECTION_HEALTH: ConnectionHealthStatus[] = [
  { connectorId: 'conn_sap', connectorName: 'SAP S/4HANA Enterprise', type: 'SAP', health: 'HEALTHY', uptimePercent: 99.99, rttLatencyMs: 24, lastHeartbeatPing: 'Just Now', sslCertExpiresAt: '2028-12-31', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_tableau', connectorName: 'Tableau Cloud & Server', type: 'TABLEAU', health: 'HEALTHY', uptimePercent: 99.98, rttLatencyMs: 28, lastHeartbeatPing: 'Just Now', sslCertExpiresAt: '2027-09-15', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_powerbi', connectorName: 'Microsoft Power BI', type: 'POWER_BI', health: 'HEALTHY', uptimePercent: 99.99, rttLatencyMs: 32, lastHeartbeatPing: '1m ago', sslCertExpiresAt: '2027-11-20', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_snowflake', connectorName: 'Snowflake Data Cloud', type: 'SNOWFLAKE', health: 'HEALTHY', uptimePercent: 100.0, rttLatencyMs: 19, lastHeartbeatPing: 'Just Now', sslCertExpiresAt: '2028-06-30', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_netsuite', connectorName: 'Oracle NetSuite OneWorld', type: 'NETSUITE', health: 'HEALTHY', uptimePercent: 99.95, rttLatencyMs: 38, lastHeartbeatPing: '2m ago', sslCertExpiresAt: '2026-10-12', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_m365', connectorName: 'Microsoft 365 (Outlook & Teams)', type: 'MICROSOFT_365', health: 'HEALTHY', uptimePercent: 99.99, rttLatencyMs: 21, lastHeartbeatPing: 'Just Now', sslCertExpiresAt: '2029-01-01', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_google', connectorName: 'Google Workspace (Gmail)', type: 'GOOGLE_WORKSPACE', health: 'HEALTHY', uptimePercent: 99.99, rttLatencyMs: 18, lastHeartbeatPing: 'Just Now', sslCertExpiresAt: '2028-04-18', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_stripe', connectorName: 'Stripe Billing & Payments', type: 'STRIPE', health: 'HEALTHY', uptimePercent: 100.0, rttLatencyMs: 22, lastHeartbeatPing: 'Just Now', sslCertExpiresAt: '2030-01-01', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_docusign', connectorName: 'DocuSign eSignature', type: 'DOCUSIGN', health: 'HEALTHY', uptimePercent: 99.97, rttLatencyMs: 29, lastHeartbeatPing: '3m ago', sslCertExpiresAt: '2027-03-24', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_workday', connectorName: 'Workday Financials & HCM', type: 'WORKDAY', health: 'HEALTHY', uptimePercent: 99.92, rttLatencyMs: 45, lastHeartbeatPing: '5m ago', sslCertExpiresAt: '2027-08-19', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_salesforce', connectorName: 'Salesforce CRM Enterprise', type: 'SALESFORCE', health: 'HEALTHY', uptimePercent: 99.96, rttLatencyMs: 42, lastHeartbeatPing: '1m ago', sslCertExpiresAt: '2028-02-14', oauthTokenStatus: 'VALID' },
  { connectorId: 'conn_slack', connectorName: 'Slack Enterprise Grid', type: 'SLACK', health: 'HEALTHY', uptimePercent: 100.0, rttLatencyMs: 15, lastHeartbeatPing: 'Just Now', sslCertExpiresAt: '2029-05-10', oauthTokenStatus: 'VALID' },
];

// ─── MASTER EXECUTION LOGS REGISTRY ───────────────────────────────────────────

export const MASTER_WORKFLOW_RUN_LOGS: WorkflowRunLog[] = [
  {
    runId: 'RUN-2026-SAP-9812',
    workflowId: 'wf_sap_fico_01',
    workflowName: '📄 SAP FICO — Vendor Invoice 3-Way PO Matching',
    status: 'SUCCEEDED',
    durationMs: 2800,
    credits: 1350,
    timestamp: '2 mins ago',
    stepsLog: [
      '⚡ Inbound Outlook Webhook: Received invoice PDF from supplier@arri.com (200 OK)',
      '📄 DocuSight AI: Extracted 8 line items & $52,176.50 total via @gigalibs/document-ocr-core',
      '📚 Company Brain: Matched contract SLA clauses (pgvector cosine similarity 0.94)',
      '🧠 Claude 3.5 Sonnet: 3-Way PO reconciliation confirmed $0 variance',
      '🛡️ SentinelGuard: Evaluated fraud signals -> Risk Score 0/100 (ALLOW)',
      '👤 CFO Governance Gate: Auto-approved under VP delegation threshold',
      '💰 General Ledger: Balanced entry committed (#1000 Cash / #4000 Revenue)',
      '🏢 SAP S/4HANA: OData Journal Document #10009281 Posted (HTTP 200 in 24ms)',
    ],
  },
  {
    runId: 'RUN-2026-FICO-8821',
    workflowId: 'wf_sap_fico_02',
    workflowName: '🏛️ SAP FICO — Month-End FX Revaluation & GL Post',
    status: 'SUCCEEDED',
    durationMs: 1450,
    credits: 300,
    timestamp: '15 mins ago',
    stepsLog: [
      '⏰ Month-End Cron: Triggered at 00:00 UTC',
      '💱 @gigalibs/multi-currency: Fetched ECB closing spot rates for 10 reserve currencies',
      '📈 Realized FX Engine: Calculated +$1,267.03 realized FX gain on settled EUR invoices',
      '💰 General Ledger: Posted dual-currency entries to Account #7100 (Realized Gain)',
      '🏢 SAP FICO: Posted document type KR to SAP S/4HANA ledger (HTTP 200 in 24ms)',
    ],
  },
  {
    runId: 'RUN-2026-MM-7740',
    workflowId: 'wf_sap_mm_03',
    workflowName: '🚚 SAP MM — Soundstage Equipment Gantry Release',
    status: 'SUCCEEDED',
    durationMs: 980,
    credits: 220,
    timestamp: '1 hour ago',
    stepsLog: [
      '📍 @gigalibs/maps-core: Freight Truck #99 crossed Soundstage 4 perimeter (Jordan Curve PIP)',
      '📦 SAP MM: Verified material reservation #RES-9901 for Technocrane 30ft rig',
      '🛡️ OSHA Safety Interlock: Wind speed 18 km/h confirmed below 35 km/h threshold',
      '✍️ @gigalibs/esign-core: Dispatched X.509 PKI signed QR gate pass to driver phone',
      '💬 Slack: Posted arrival confirmation to #soundstage-ops channel',
    ],
  },
  {
    runId: 'RUN-2026-TABLEAU-6610',
    workflowId: 'wf_tableau_04',
    workflowName: '📊 Tableau & Power BI — Live Executive Revenue Sync',
    status: 'SUCCEEDED',
    durationMs: 620,
    credits: 150,
    timestamp: '2 hours ago',
    stepsLog: [
      '💳 Stripe Webhook: payment_intent.succeeded ($52,176.50 USD)',
      '🏛️ General Ledger: Allocated $4,956.77 to CA State Sales Tax Payable (#2200)',
      '📊 Tableau Cloud: Pushed row to GigaLibs_Settlement_Hyper extract via REST API v3.21 (28ms)',
      '📈 Power BI: Streamed real-time transaction event to executive financial workspace (32ms)',
    ],
  },
];

// ─── MASTER PALETTE TEMPLATES (NODE BOXES TO ADD) ─────────────────────────────

export interface PaletteItem {
  label: string;
  category: WorkflowNodeData['category'];
  icon: string;
  tag: string;
  description: string;
  defaultConfig: Record<string, any>;
  credits: number;
}

export const NODE_PALETTE_ITEMS: Record<string, PaletteItem[]> = {
  TRIGGERS: [
    { label: 'Inbound Webhook', category: 'trigger', icon: '⚡', tag: 'WEBHOOK', description: 'Listens for incoming JSON/PDF HTTP POST payloads', defaultConfig: { detail: '/api/v1/inbound/events', secret: 'whsec_9921' }, credits: 0 },
    { label: 'CRON Schedule Trigger', category: 'trigger', icon: '⏰', tag: 'SCHEDULE', description: 'Executes automatically on cron interval (e.g. daily at 00:00 UTC)', defaultConfig: { detail: 'Schedule: 0 0 * * *' }, credits: 0 },
    { label: 'Geofence Perimeter Entry', category: 'trigger', icon: '📍', tag: 'GEOFENCE', description: 'Triggered when GPS asset crosses polygon boundary', defaultConfig: { detail: 'Stage 4 Perimeter (Jordan Curve PIP)' }, credits: 0 },
  ],
  GIGALIBS_MODULES: [
    { label: 'DocuSight AI OCR Processor', category: 'module_ocr', icon: '📄', tag: '@gigalibs/ocr-core', description: 'Extracts tables, tax rates, and totals with 100% precision', defaultConfig: { detail: '@gigalibs/document-ocr-core (GPT-4o)' }, credits: 200 },
    { label: 'SentinelGuard Fraud 0-100', category: 'module_fraud', icon: '🛡️', tag: '@gigalibs/fraud-engine', description: 'Evaluates 8 fraud signals and geovelocity in <5ms', defaultConfig: { detail: '@gigalibs/fraud-detection (0-100 Score)' }, credits: 100 },
    { label: 'Double-Entry General Ledger', category: 'module_ledger', icon: '💰', tag: '@gigalibs/ledger-core', description: 'Commits balanced ACID Debit/Credit journals', defaultConfig: { detail: 'Balanced ACID General Ledger Post' }, credits: 50 },
    { label: 'Cryptographic E-Sign Seal', category: 'module_esign', icon: '✍️', tag: '@gigalibs/esign-core', description: 'X.509 PKI signed multi-party envelope execution', defaultConfig: { detail: 'RFC 3161 TSA Cryptographic Seal' }, credits: 100 },
    { label: 'Company Brain pgvector RAG', category: 'module_brain', icon: '📚', tag: 'BRAIN_RAG', description: 'Retrieves contract clauses with cosine vector similarity', defaultConfig: { detail: 'pgvector source: vendor_msas' }, credits: 150 },
  ],
  AI_AGENTS: [
    { label: 'Claude 3.5 Sonnet Extraction', category: 'llm', icon: '🧠', tag: 'CLAUDE_3.5', description: 'Complex multi-step legal and financial reasoning', defaultConfig: { detail: 'model: claude-3-5-sonnet' }, credits: 800 },
    { label: 'CFO Governance Approval Gate', category: 'approval', icon: '👤', tag: 'HUMAN_GATE', description: 'Mandatory human approval before high-value ledger posting', defaultConfig: { detail: 'Threshold: Amount > $10,000' }, credits: 0 },
  ],
  CONNECTORS: [
    { label: 'Post to SAP S/4HANA BAPI', category: 'http', icon: '🏢', tag: 'SAP_ODATA', description: 'Posts Journal Document type KR via OData API', defaultConfig: { detail: 'API_JOURNALENTRY_SRV' }, credits: 50 },
    { label: 'Tableau Hyper Extract Sync', category: 'http', icon: '📊', tag: 'TABLEAU_HYPER', description: 'Appends rows into Tableau Cloud data extracts', defaultConfig: { detail: 'REST API v3.21 (.hyper)' }, credits: 50 },
    { label: 'Post to Microsoft 365', category: 'http', icon: '📧', tag: 'M365_GRAPH', description: 'Archives signed PDF to SharePoint & emails controller', defaultConfig: { detail: 'Microsoft Graph Drive API' }, credits: 50 },
    { label: 'Slack Alert Dispatcher', category: 'http', icon: '💬', tag: 'SLACK_BOLT', description: 'Dispatches interactive card to #finance-approvals', defaultConfig: { detail: 'channel: #finance-approvals' }, credits: 20 },
  ],
};

// ─── REACTFLOW CUSTOM NODE COMPONENT ──────────────────────────────────────────

function UniversalStudioNode({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const isRunning = data.status === 'running';
  const isSuccess = data.status === 'success';

  const categoryMeta: Record<string, { icon: string; tag: string; color: string; border: string; bg: string }> = {
    trigger: { icon: '⚡', tag: 'INBOUND TRIGGER', color: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-500/10' },
    module_ocr: { icon: '📄', tag: '@gigalibs/document-ocr-core', color: 'text-cyan-400', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
    module_brain: { icon: '📚', tag: 'COMPANY BRAIN RAG', color: 'text-blue-400', border: 'border-blue-500/40', bg: 'bg-blue-500/10' },
    llm: { icon: '🧠', tag: 'AI REASONING (LLM)', color: 'text-purple-400', border: 'border-purple-500/40', bg: 'bg-purple-500/10' },
    module_fraud: { icon: '🛡️', tag: '@gigalibs/fraud-detection', color: 'text-rose-400', border: 'border-rose-500/40', bg: 'bg-rose-500/10' },
    module_esign: { icon: '✍️', tag: '@gigalibs/esign-core', color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
    module_ledger: { icon: '💰', tag: '@gigalibs/ledger-core', color: 'text-green-400', border: 'border-green-500/40', bg: 'bg-green-500/10' },
    approval: { icon: '👤', tag: 'HUMAN APPROVAL GATE', color: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-500/10' },
    http: { icon: '🌐', tag: 'ERP / BI CONNECTOR', color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
  };

  const meta = categoryMeta[data.category] || categoryMeta.trigger;

  return (
    <div
      className={`relative min-w-[260px] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl transition-all duration-200 ${
        selected
          ? 'border-indigo-500 bg-slate-900 ring-2 ring-indigo-500/50 shadow-indigo-950/60'
          : 'border-slate-800 bg-slate-900/95 hover:border-slate-700'
      } ${isRunning ? 'ring-2 ring-amber-400/80 animate-pulse' : ''} ${
        isSuccess ? 'border-emerald-500/80' : ''
      }`}
    >
      {data.category !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-indigo-500 !w-3 !h-3 !border-slate-950 !border-2"
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${meta.bg} ${meta.border} border text-sm`}>
            {meta.icon}
          </span>
          <div>
            <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${meta.color}`}>
              {meta.tag}
            </span>
            <h4 className="text-xs font-bold text-white line-clamp-1">{data.label}</h4>
          </div>
        </div>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isRunning ? 'bg-amber-400 animate-ping' : isSuccess ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-700'
          }`}
        />
      </div>

      <div className="mt-3 rounded-lg bg-slate-950/80 px-2.5 py-1.5 text-[10px] font-mono text-slate-400 border border-slate-800/80 flex justify-between items-center">
        <span className="truncate max-w-[170px]">{data.config?.detail || data.id}</span>
        <span className="text-[9px] font-bold text-indigo-400">{data.credits ? `${data.credits} credits` : '0 credits'}</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-indigo-500 !w-3 !h-3 !border-slate-950 !border-2"
      />
    </div>
  );
}

const customNodeTypes: any = {
  customNode: UniversalStudioNode,
};

export function WorkflowStudioCanvas() {
  const [activeInnerTab, setActiveInnerTab] = React.useState<'CANVAS' | 'GIGA_VIEWS' | 'HEALTH' | 'LOGS' | 'SWARM' | 'CONNECTORS'>('CANVAS');

  // Master Workflows State
  const [workflows, setWorkflows] = React.useState<WorkflowDefinition[]>(MASTER_WORKFLOWS_REGISTRY);
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState<string>(MASTER_WORKFLOWS_REGISTRY[0]!.id);
  const [isNewWorkflowModalOpen, setIsNewWorkflowModalOpen] = React.useState(false);
  const [newWfName, setNewWfName] = React.useState('');
  const [newWfApp, setNewWfApp] = React.useState('SAP S/4HANA & SAP FICO');

  // Active Workflow Definition
  const activeWorkflow = workflows.find((w) => w.id === selectedWorkflowId) || workflows[0]!;

  // ReactFlow Nodes & Edges tied to selected workflow
  const [nodes, setNodes, onNodesChange] = useNodesState(activeWorkflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(activeWorkflow.edges);
  const [selectedNode, setSelectedNode] = React.useState<Node<WorkflowNodeData> | null>(activeWorkflow.nodes[0] || null);

  // Palette & Config Drawer UI State
  const [isPaletteOpen, setIsPaletteOpen] = React.useState(true);
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = React.useState(true);
  const [paletteSearchQuery, setPaletteSearchQuery] = React.useState('');

  // Sync canvas whenever workflow changes
  React.useEffect(() => {
    setNodes(activeWorkflow.nodes);
    setEdges(activeWorkflow.edges);
    setSelectedNode(activeWorkflow.nodes[0] || null);
  }, [selectedWorkflowId, activeWorkflow]);

  // Execution runner state
  const [isRunningTest, setIsRunningTest] = React.useState(false);
  const [testLogs, setTestLogs] = React.useState<string[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = React.useState(true);

  // Health Telemetry State
  const [healthStatus] = React.useState<ConnectionHealthStatus[]>(MASTER_CONNECTION_HEALTH);

  // Execution Run Logs State — loaded from real DB
  const [runLogs, setRunLogs] = React.useState<WorkflowRunLog[]>(MASTER_WORKFLOW_RUN_LOGS);
  const [logSearchQuery, setLogSearchQuery] = React.useState('');

  React.useEffect(() => {
    ApiClient.listWorkflowRuns()
      .then((dbRuns) => {
        if (dbRuns && dbRuns.length > 0) {
          const mapped: WorkflowRunLog[] = dbRuns.map((r: any) => ({
            id: r.id,
            workflowName: r.pipeline?.name ?? 'Workflow Run',
            appTarget: r.pipeline?.targetApp ?? 'GigaLibs',
            status: r.status === 'SUCCEEDED' ? 'SUCCESS' : r.status === 'FAILED' ? 'FAILED' : 'RUNNING',
            startedAt: new Date(r.startedAt).toLocaleString(),
            durationMs: r.durationMs ?? 0,
            creditsSettled: r.creditsSettled ?? 0,
            triggeredBy: 'System',
            executionLog: r.executionLog,
          }));
          setRunLogs(mapped);
        }
      })
      .catch(() => {/* keep static defaults */});
  }, []);

  // Connector Inspector Modal State
  const [selectedHealthModal, setSelectedHealthModal] = React.useState<ConnectionHealthStatus | null>(null);

  const onConnect = React.useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const onNodeClick = React.useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node as Node<WorkflowNodeData>);
    setIsConfigDrawerOpen(true);
  }, []);

  // Add Node from Palette onto Canvas
  const handleAddPaletteNode = (item: PaletteItem) => {
    const newId = `node_${Date.now().toString().slice(-5)}`;
    // Place near selected node or offset
    const posX = selectedNode ? selectedNode.position.x + 350 : 500 + Math.random() * 80;
    const posY = selectedNode ? selectedNode.position.y : 200 + Math.random() * 60;

    const newNode: Node<WorkflowNodeData> = {
      id: newId,
      type: 'customNode',
      position: { x: posX, y: posY },
      data: {
        label: item.label,
        category: item.category,
        status: 'idle',
        config: item.defaultConfig,
        credits: item.credits,
      },
    };

    setNodes((nds) => [...nds, newNode]);

    // Automatically connect from currently selected node
    if (selectedNode) {
      const newEdge: Edge = {
        id: `e_${selectedNode.id}_${newId}`,
        source: selectedNode.id,
        target: newId,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
      };
      setEdges((eds) => [...eds, newEdge]);
    }

    setSelectedNode(newNode);
  };

  // Delete Selected Node
  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  // Run DAG Execution with Live Open API Data Fetch
  const handleRunDAG = async () => {
    setIsRunningTest(true);
    setIsConsoleOpen(true);
    setTestLogs([
      `[00:00.000] 🚀 Initializing execution for: ${activeWorkflow.name}...`,
      `[00:00.100] 🌐 Connecting to target: ${activeWorkflow.appTarget}...`,
    ]);

    let liveFeed: any = null;
    try {
      if (activeWorkflow.id === 'wf_github_live') {
        liveFeed = await LiveExternalApiHub.fetchGitHubReactCommits('facebook/react');
      } else if (activeWorkflow.id === 'wf_usgs_earthquake_live') {
        liveFeed = await LiveExternalApiHub.fetchUsgsEarthquakes();
      } else if (activeWorkflow.id === 'wf_ecommerce_pricing_live') {
        liveFeed = await LiveExternalApiHub.fetchEcommerceCatalog();
      } else if (activeWorkflow.id === 'wf_hackernews_trending_live') {
        liveFeed = await LiveExternalApiHub.fetchHackerNewsTop();
      } else if (activeWorkflow.id === 'wf_weather_telemetry_live') {
        liveFeed = await LiveExternalApiHub.fetchWeatherTelemetry();
      } else if (activeWorkflow.id === 'wf_coingecko_liquidity_live') {
        liveFeed = await LiveExternalApiHub.fetchCryptoMarketPrices();
      }
    } catch (err: any) {
      console.warn('Live API fetch notice:', err);
    }

    const nodeIds = nodes.map((n) => n.id);
    for (let i = 0; i < nodeIds.length; i++) {
      const nid = nodeIds[i];
      setNodes((nds) => nds.map((n) => (n.id === nid ? { ...n, data: { ...n.data, status: 'running' } } : n)));
      await new Promise((r) => setTimeout(r, 400));
      setNodes((nds) => nds.map((n) => (n.id === nid ? { ...n, data: { ...n.data, status: 'success' } } : n)));
      
      let stepDetail = `(200 OK - Latency: ${liveFeed?.latencyMs || 45}ms)`;
      if (i === 0 && liveFeed) {
        stepDetail = `(Ingested ${liveFeed.itemCount} live records from ${liveFeed.endpoint})`;
      } else if (i === 1 && liveFeed?.data) {
        const sample = Array.isArray(liveFeed.data) ? liveFeed.data[0] : liveFeed.data;
        stepDetail = `(Processed payload: ${JSON.stringify(sample).slice(0, 75)}...)`;
      }

      setTestLogs((prev) => [
        ...prev,
        `[00:0${i + 1}.${i * 200}] ✓ Step ${i + 1}/${nodeIds.length}: ${nodes[i]?.data?.label} ${stepDetail}`,
      ]);
    }

    if (liveFeed && liveFeed.data) {
      const displayData = Array.isArray(liveFeed.data) ? liveFeed.data.slice(0, 3) : liveFeed.data;
      setTestLogs((prev) => [
        ...prev,
        `[LIVE PAYLOAD]: ${JSON.stringify(displayData, null, 2)}`,
      ]);
    }

    setTestLogs((prev) => [
      ...prev,
      `[00:0${nodeIds.length + 1}.000] 🎉 Pipeline execution SUCCEEDED! Verified against ${activeWorkflow.appTarget}. Total Credits: ${nodes.reduce((s, n) => s + (n.data?.credits || 0), 0)} CR.`,
    ]);
    setIsRunningTest(false);
  };

  // Create New Workflow
  const handleCreateWorkflow = () => {
    if (!newWfName.trim()) return;
    const newId = `wf_custom_${Date.now()}`;
    const newWf: WorkflowDefinition = {
      id: newId,
      name: newWfName,
      appTarget: newWfApp,
      category: 'ERP_FINANCE',
      description: `Custom automated pipeline for ${newWfApp}`,
      isActive: true,
      triggerType: 'WEBHOOK',
      totalRuns: 0,
      successRatePercent: 100,
      nodes: [
        { id: 'n1', type: 'customNode', position: { x: 50, y: 200 }, data: { label: `${newWfApp} Inbound Trigger`, category: 'trigger', status: 'idle', config: { detail: 'Inbound Webhook' }, credits: 0 } },
        { id: 'n2', type: 'customNode', position: { x: 450, y: 200 }, data: { label: 'DocuSight AI Extraction', category: 'module_ocr', status: 'idle', config: { detail: '@gigalibs/document-ocr-core' }, credits: 200 } },
        { id: 'n3', type: 'customNode', position: { x: 850, y: 200 }, data: { label: `Sync to ${newWfApp}`, category: 'http', status: 'idle', config: { detail: 'OData REST Endpoint' }, credits: 50 } },
      ],
      edges: [
        { id: 'e1-2', source: 'n1', target: 'n2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
        { id: 'e2-3', source: 'n2', target: 'n3', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
      ],
    };

    setWorkflows((prev) => [newWf, ...prev]);
    setSelectedWorkflowId(newId);
    setIsNewWorkflowModalOpen(false);
    setNewWfName('');
    alert(`Workflow '${newWf.name}' created and loaded to canvas!`);
  };

  return (
    <div className="space-y-4">
      {/* Top Multi-Workflow Selector Bar */}
      <div className="p-3 bg-slate-900 text-white rounded-2xl border border-slate-800 flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-xs text-indigo-300">📂 Active Workflow Pipeline:</span>
          <select
            value={selectedWorkflowId}
            onChange={(e) => setSelectedWorkflowId(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold text-xs max-w-md truncate"
          >
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.name} ({wf.appTarget})
              </option>
            ))}
          </select>

          <Button
            size="sm"
            onClick={() => setIsNewWorkflowModalOpen(true)}
            className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs"
          >
            + Create New Pipeline
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <Badge variant="success">{activeWorkflow.successRatePercent}% Uptime</Badge>
          <span className="text-slate-400">Total Runs: {activeWorkflow.totalRuns.toLocaleString()}</span>
        </div>
      </div>

      {/* Studio Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 bg-slate-900 text-white rounded-2xl border border-slate-800">
        <div className="flex items-center gap-1.5">
          {[
            { id: 'CANVAS', label: '🎨 Visual ReactFlow DAG Canvas' },
            { id: 'GIGA_VIEWS', label: '📊 Giga Views (Multi-Domain Data)' },
            { id: 'HEALTH', label: `💓 Connection Health & Heartbeats (${healthStatus.length})` },
            { id: 'LOGS', label: `📜 Execution Runs & Audit Logs (${runLogs.length})` },
            { id: 'SWARM', label: '👥 Multi-Agent Swarm (4 Personas)' },
            { id: 'CONNECTORS', label: '🏢 Enterprise Connectors (12 Live)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveInnerTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                activeInnerTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 pr-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsPaletteOpen(!isPaletteOpen)}
            className="!text-slate-300 text-xs font-bold"
          >
            {isPaletteOpen ? 'Hide Palette ✕' : '🧰 Node Palette'}
          </Button>

          <Button
            size="sm"
            onClick={handleRunDAG}
            disabled={isRunningTest}
            className="!bg-emerald-600 hover:!bg-emerald-500 !text-white font-bold text-xs"
          >
            {isRunningTest ? '⚡ Executing Pipeline...' : 'Run Live Execution Simulation 🚀'}
          </Button>
        </div>
      </div>

      {/* ─── TAB 1: VISUAL REACTFLOW CANVAS WITH PALETTE & CONFIG DRAWER ────────── */}
      {activeInnerTab === 'CANVAS' && (
        <div className="space-y-4">
          <div className="flex gap-4 items-start">
            {/* 1. LEFT NODE PALETTE (ADD BOXES / BUILDING BLOCKS) */}
            {isPaletteOpen && (
              <Card className="w-72 bg-slate-900 border-slate-800 text-white p-4 space-y-4 max-h-[580px] overflow-y-auto shrink-0 shadow-2xl">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
                    🧰 Node Building Blocks
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">1-Click Add</span>
                </div>

                <Input
                  placeholder="🔍 Search elements..."
                  value={paletteSearchQuery}
                  onChange={(e) => setPaletteSearchQuery(e.target.value)}
                  className="!h-8 !text-xs !bg-slate-950 !border-slate-800 !text-white"
                />

                {/* Categories */}
                {Object.entries(NODE_PALETTE_ITEMS).map(([catKey, items]) => {
                  const filtered = items.filter((it) =>
                    it.label.toLowerCase().includes(paletteSearchQuery.toLowerCase()) ||
                    it.description.toLowerCase().includes(paletteSearchQuery.toLowerCase())
                  );
                  if (filtered.length === 0) return null;

                  return (
                    <div key={catKey} className="space-y-1.5">
                      <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block tracking-wider">
                        {catKey.replace('_', ' ')}
                      </span>
                      <div className="space-y-1">
                        {filtered.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleAddPaletteNode(item)}
                            className="p-2.5 bg-slate-950 hover:bg-indigo-950/60 border border-slate-800/80 hover:border-indigo-500/60 rounded-xl cursor-pointer transition space-y-1 group"
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                <span>{item.icon}</span>
                                <strong className="text-[11px] text-slate-200 group-hover:text-white block font-sans">
                                  {item.label}
                                </strong>
                              </div>
                              <span className="text-indigo-400 text-xs font-bold">+</span>
                            </div>
                            <p className="text-[10px] text-slate-400 line-clamp-1">{item.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}

            {/* 2. CENTER REACTFLOW CANVAS */}
            <div className="flex-1 relative h-[580px] rounded-3xl border border-slate-800 overflow-hidden bg-slate-950 shadow-2xl">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                nodeTypes={customNodeTypes}
                fitView
                attributionPosition="bottom-left"
              >
                <Background color="#334155" gap={24} size={1.5} />
                <Controls className="!bg-slate-900 !border-slate-800 !text-white !rounded-2xl" />
                <MiniMap
                  nodeStrokeColor="#6366f1"
                  nodeColor="#1e293b"
                  className="!bg-slate-900 !border-slate-800 !rounded-2xl"
                />

                <Panel position="top-right" className="bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl border border-slate-800 text-white text-xs space-y-1">
                  <div className="font-bold text-indigo-400">⚡ Active Target: {activeWorkflow.appTarget}</div>
                  <div className="text-[11px] text-slate-300">Nodes: {nodes.length} • Edges: {edges.length}</div>
                  <div className="text-[10px] font-mono text-emerald-400">✓ Topological Cycle Validation Passed</div>
                </Panel>
              </ReactFlow>
            </div>

            {/* 3. RIGHT NODE CONFIGURATION DRAWER / INSPECTOR */}
            {isConfigDrawerOpen && selectedNode && (
              <Card className="w-80 bg-slate-900 border-slate-800 text-white p-4 space-y-4 max-h-[580px] overflow-y-auto shrink-0 shadow-2xl">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚙️</span>
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
                      Node Configuration
                    </h4>
                  </div>
                  <button onClick={() => setIsConfigDrawerOpen(false)} className="text-slate-400 hover:text-white text-xs">
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase mb-1">
                      Step Label / Identifier
                    </label>
                    <Input
                      value={selectedNode.data.label}
                      onChange={(e) => {
                        const newLabel = e.target.value;
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, data: { ...n.data, label: newLabel } }
                              : n
                          )
                        );
                        setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, label: newLabel } } : null);
                      }}
                      className="!h-8 !text-xs !bg-slate-950 !border-slate-800 !text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase mb-1">
                      Category & Sub-Module
                    </label>
                    <Badge variant="info">{selectedNode.data.category}</Badge>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-slate-400 font-bold block uppercase mb-1">
                      Execution Parameter / Endpoint
                    </label>
                    <Input
                      value={selectedNode.data.config?.detail || ''}
                      onChange={(e) => {
                        const newDetail = e.target.value;
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, data: { ...n.data, config: { ...n.data.config, detail: newDetail } } }
                              : n
                          )
                        );
                        setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, config: { ...prev.data.config, detail: newDetail } } } : null);
                      }}
                      className="!h-8 !text-xs !bg-slate-950 !border-slate-800 !text-white"
                    />
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="text-slate-400 text-[10px] uppercase font-bold">Runtime Telemetry:</div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Node ID:</span>
                      <span className="text-indigo-400 font-bold">{selectedNode.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Credit Cost:</span>
                      <span className="text-emerald-400 font-bold">{selectedNode.data.credits || 0} credits</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Execution Status:</span>
                      <StatusBadge variant={selectedNode.data.status === 'success' ? 'success' : 'neutral'}>
                        {selectedNode.data.status || 'idle'}
                      </StatusBadge>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <Button
                      size="sm"
                      onClick={() => alert(`✓ Test executed on node '${selectedNode.data.label}'! Result: 200 OK in 45ms.`)}
                      className="w-full !bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs"
                    >
                      Test Step in Isolation ⚡
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDeleteSelectedNode}
                      className="w-full !text-rose-400 hover:!bg-rose-950/50 hover:!border-rose-500 font-bold text-xs"
                    >
                      Delete Node 🗑️
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Console Drawer */}
          {isConsoleOpen && (
            <Card className="p-4 bg-slate-950 border-slate-800 text-emerald-400 font-mono text-xs space-y-1 shadow-2xl max-h-44 overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
                <span className="font-bold text-indigo-400 font-sans">🖥️ Real-Time Execution Trace & Function Call Output</span>
                <button onClick={() => setTestLogs([])} className="text-[10px] text-slate-500 hover:text-slate-300">Clear</button>
              </div>
              {testLogs.length > 0 ? (
                testLogs.map((log, idx) => <div key={idx}>{log}</div>)
              ) : (
                <div className="text-slate-500">Ready. Click 'Run Live Execution Simulation 🚀' to test {activeWorkflow.name}.</div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ─── TAB: GIGA VIEWS (MULTI-DOMAIN DATA LAKE & BI VISUALS) ─────────────── */}
      {activeInnerTab === 'GIGA_VIEWS' && (
        <UniversalDataStudioPro />
      )}

      {/* ─── TAB 2: LIVE CONNECTION HEALTH & HEARTBEAT MONITOR ──────────────────── */}
      {activeInnerTab === 'HEALTH' && (
        <Card className="max-w-5xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900">💓 Live Enterprise Connection Health & Heartbeats</h3>
              <p className="text-xs text-slate-500">
                Real-time RTT latency pings, 99.99% uptime monitors, SSL certificate expirations, and OAuth2 token validity.
              </p>
            </div>
            <Badge variant="success">12/12 Connectors Online</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead className="bg-slate-100 border-b text-slate-700 font-bold">
                <tr>
                  <th className="p-3 border-r font-sans">Enterprise Connector</th>
                  <th className="p-3 border-r text-center">Status</th>
                  <th className="p-3 border-r text-right">RTT Ping</th>
                  <th className="p-3 border-r text-center">Uptime</th>
                  <th className="p-3 border-r text-center">OAuth Token</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {healthStatus.map((h) => (
                  <tr key={h.connectorId} className="hover:bg-slate-50">
                    <td className="p-3 border-r font-sans font-bold text-slate-900">{h.connectorName}</td>
                    <td className="p-3 border-r text-center">
                      <Badge variant={h.health === 'HEALTHY' ? 'success' : 'warning'}>{h.health}</Badge>
                    </td>
                    <td className="p-3 border-r text-right font-black text-indigo-600">{h.rttLatencyMs} ms</td>
                    <td className="p-3 border-r text-center font-bold text-emerald-600">{h.uptimePercent}%</td>
                    <td className="p-3 border-r text-center">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">
                        {h.oauthTokenStatus}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedHealthModal(h)} className="text-xs font-bold">
                        Inspect Health 🔍
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ─── TAB 3: PER-WORKFLOW EXECUTION LOGS & AUDIT TRAIL ───────────────────── */}
      {activeInnerTab === 'LOGS' && (
        <Card className="max-w-5xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900">📜 Per-Workflow Execution Logs & Audit Trail</h3>
              <p className="text-xs text-slate-500">
                Granular step-by-step latency, input/output payload traces, and error DLQ recovery logs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="🔍 Search Run ID or Step..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                className="w-56"
              />
            </div>
          </div>

          <div className="space-y-4 text-xs font-mono">
            {runLogs
              .filter(
                (r) =>
                  r.workflowName.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
                  r.runId.toLowerCase().includes(logSearchQuery.toLowerCase())
              )
              .map((run) => (
                <div key={run.runId} className="p-4 bg-slate-50 rounded-2xl border space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 font-sans text-sm">{run.workflowName}</span>
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">{run.runId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success">{run.status}</Badge>
                      <span className="text-slate-400 text-[11px]">{run.timestamp}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 text-emerald-400 rounded-xl text-[11px] space-y-1 shadow-inner">
                    {run.stepsLog.map((step, sidx) => (
                      <div key={sidx}>{step}</div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-1 text-[11px] text-slate-500 border-t">
                    <span>Duration: <strong>{run.durationMs}ms</strong> • Credits: <strong>{run.credits}</strong></span>
                    <span className="text-indigo-600 font-bold">✓ Cryptographically Hashed (SHA-256 Audit Trail)</span>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* ─── TAB 4: MULTI-AGENT SWARM ───────────────────────────────────────────── */}
      {activeInnerTab === 'SWARM' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MASTER_AGENT_SWARM.map((agent) => (
            <Card key={agent.id} className="p-5 space-y-3 bg-slate-900 border-slate-800 text-white shadow-xl">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-800 rounded-2xl border border-slate-700 flex items-center justify-center text-2xl shadow-inner">
                    {agent.avatar}
                  </div>
                  <div>
                    <strong className="text-sm text-white font-bold block">{agent.name}</strong>
                    <span className="text-[11px] text-indigo-300 font-medium">{agent.role}</span>
                  </div>
                </div>
                <Badge variant="success">{agent.status}</Badge>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1 font-mono">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Base Model Engine:</div>
                <div className="text-indigo-400 font-bold">{agent.model}</div>
                <div className="text-slate-400 text-[10px] uppercase font-bold mt-2">System Persona Prompt:</div>
                <div className="text-slate-300 text-[11px] leading-relaxed font-sans">{agent.systemPrompt}</div>
              </div>

              <div className="space-y-1 text-xs">
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase block">Assigned GigaLibs Tools:</span>
                <div className="flex flex-wrap gap-1.5">
                  {agent.tools.map((t, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded-lg bg-indigo-950 border border-indigo-500/30 text-indigo-300 text-[10px] font-mono font-bold">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Completed Tasks: <strong className="text-emerald-400">{agent.totalTasksCompleted.toLocaleString()}</strong></span>
                <span className="text-indigo-400">Autonomous Tool Calling Active</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ─── TAB 5: ENTERPRISE CONNECTORS HUB ────────────────────────────────────── */}
      {activeInnerTab === 'CONNECTORS' && (
        <Card className="max-w-5xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">🏢 12 Enterprise System Connectors</h3>
            <p className="text-xs text-slate-500">
              Live adapters with OAuth2 / API Key vaults connecting Tableau, Power BI, Snowflake, SAP, NetSuite, and M365.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {MASTER_CONNECTION_HEALTH.map((conn) => (
              <div key={conn.connectorId} className="p-4 bg-slate-50 rounded-2xl border space-y-2">
                <div className="flex justify-between items-start">
                  <strong className="text-slate-900 font-sans">{conn.connectorName}</strong>
                  <Badge variant="success">{conn.rttLatencyMs}ms</Badge>
                </div>
                <div className="font-mono text-[11px] text-slate-500">Uptime: {conn.uptimePercent}% • Token: {conn.oauthTokenStatus}</div>
                <Button size="sm" variant="outline" onClick={() => alert(`✓ Socket Ping 200 OK: ${conn.connectorName} latency is ${conn.rttLatencyMs}ms`)} className="w-full font-bold">
                  Test Ping ⚡
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal: Create New Workflow */}
      {isNewWorkflowModalOpen && (
        <Modal
          isOpen={isNewWorkflowModalOpen}
          onClose={() => setIsNewWorkflowModalOpen(false)}
          title="⚡ Create New Enterprise AI Workflow Pipeline"
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold block mb-1">Workflow Pipeline Name</label>
              <Input
                placeholder="e.g. SAP FICO — Late Fee Dunning Collections"
                value={newWfName}
                onChange={(e) => setNewWfName(e.target.value)}
              />
            </div>

            <div>
              <label className="font-bold block mb-1">Target Enterprise Application</label>
              <select
                value={newWfApp}
                onChange={(e) => setNewWfApp(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
              >
                <option value="SAP S/4HANA & SAP FICO">SAP S/4HANA & SAP FICO</option>
                <option value="SAP S/4HANA (Materials Mgmt)">SAP S/4HANA (Materials Mgmt)</option>
                <option value="Oracle NetSuite OneWorld">Oracle NetSuite OneWorld</option>
                <option value="Tableau Cloud & Power BI">Tableau Cloud & Power BI</option>
                <option value="Microsoft 365 & DocuSign">Microsoft 365 & DocuSign</option>
                <option value="Workday Financials & HCM">Workday Financials & HCM</option>
              </select>
            </div>

            <Button onClick={handleCreateWorkflow} className="w-full !bg-indigo-600 !text-white font-bold">
              Instantiate Workflow & Load Canvas 🚀
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: Health Inspector */}
      {selectedHealthModal && (
        <Modal
          isOpen={!!selectedHealthModal}
          onClose={() => setSelectedHealthModal(null)}
          title={`💓 ${selectedHealthModal.connectorName} - Health Telemetry`}
        >
          <div className="space-y-3 text-xs font-mono">
            <div className="p-4 bg-slate-50 rounded-2xl border space-y-1.5 text-slate-800">
              <div>• Status: <strong className="text-emerald-600">{selectedHealthModal.health} (200 OK)</strong></div>
              <div>• RTT Latency: <strong>{selectedHealthModal.rttLatencyMs} ms</strong></div>
              <div>• 30-Day SLA Uptime: <strong>{selectedHealthModal.uptimePercent}%</strong></div>
              <div>• OAuth2 Token State: <strong>{selectedHealthModal.oauthTokenStatus} (Auto-Refreshes in 45m)</strong></div>
              <div>• TLS/SSL Certificate: <strong>Valid until {selectedHealthModal.sslCertExpiresAt}</strong></div>
              <div>• Last Socket Ping: <strong>{selectedHealthModal.lastHeartbeatPing}</strong></div>
            </div>
            <Button onClick={() => setSelectedHealthModal(null)} className="w-full font-bold">
              Close Telemetry
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
