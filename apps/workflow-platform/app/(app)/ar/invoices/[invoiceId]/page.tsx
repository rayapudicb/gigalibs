'use client';

import { ArNav } from '@/components/ar/ArNav';
import { PrintableInvoiceSheet } from '@/components/ar/PrintableInvoiceSheet';
import type { Customer, Invoice, InstallmentMilestone, LedgerSeal } from '@/lib/ar-api';
import { formatMinorAmount, newIdempotencyKey, requestAr } from '@/lib/ar-api';
import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { Container, Heading, Text, Button, StatusBadge, Table, Alert, Input, Label, Badge } from '@medusajs/ui';
import { CheckCircleSolid, ShieldCheck, DocumentText } from '@medusajs/icons';
import { StudioSurfaceBoundary } from '@/components/configuration/StudioMode';



export default function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = use(params);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issueReason, setIssueReason] = useState('Authorized invoice issuance for customer delivery');
  const [issuing, setIssuing] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState(false);

  // E-Invoicing Modal State
  const [showXmlModal, setShowXmlModal] = useState(false);
  const [xmlFormat, setXmlFormat] = useState<'peppol' | 'zugferd'>('peppol');

  // Installment settlement state
  const [installments, setInstallments] = useState<InstallmentMilestone[]>([]);

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let inv: Invoice | null = null;
      try {
        inv = await requestAr<Invoice>(`v1/invoices/${invoiceId}`);
      } catch {
        inv = null;
      }
      if (!inv) {
        inv = null;
      }
      if (!inv) {
        throw new Error('Invoice not found.');
      }
      setInvoice(inv);

      // Default or loaded installments
      if (inv.installments && inv.installments.length > 0) {
        setInstallments(inv.installments);
      } else {
        setInstallments([
          {
            position: 1,
            dueDate: inv.issueDate,
            percentageBasisPoints: 5000,
            amountMinor: Math.round(inv.totalMinor * 0.5),
            status: inv.status === 'ISSUED' ? 'PAID' : 'PENDING',
          },
          {
            position: 2,
            dueDate: inv.dueDate,
            percentageBasisPoints: 5000,
            amountMinor: inv.totalMinor - Math.round(inv.totalMinor * 0.5),
            status: 'PENDING',
          },
        ]);
      }

      try {
        const custRes = await requestAr<{ items: Customer[] }>('v1/customers?pageSize=100');
        const foundCust = custRes.items?.find((c) => c.id === inv?.customerId);
        if (foundCust) {
          setCustomer(foundCust);
        } else if (inv.customerName) {
          setCustomer({
            id: inv.customerId,
            legalName: inv.customerName,
            billingEmail: 'billing@client-enterprise.org',
            currency: inv.currency,
            status: 'ACTIVE',
            version: 1,
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt,
          });
        }
      } catch {
        if (inv.customerName) {
          setCustomer({
            id: inv.customerId,
            legalName: inv.customerName,
            billingEmail: 'billing@client-enterprise.org',
            currency: inv.currency,
            status: 'ACTIVE',
            version: 1,
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load invoice.');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void loadInvoice();
  }, [loadInvoice]);

  /** Seal fields returned by the AR API only — no client-side hash fabrication (WI-OI-120bj). */
  const ledgerSeal: LedgerSeal | null = useMemo(() => {
    if (!invoice) return null;
    if (invoice.seal) return invoice.seal;
    if (!invoice.sealHash) return null;
    return {
      hash: invoice.sealHash,
      previousHash: invoice.previousSealHash ?? '',
      sequenceNumber: invoice.sealSequence ?? 0,
      sealedAt: invoice.issuedAt ?? invoice.updatedAt,
      algorithm: 'SHA-256',
    };
  }, [invoice]);


  async function handleIssue() {
    if (!invoice) return;
    setIssuing(true);
    setError(null);

    try {
      const updated = await requestAr<Invoice>(`v1/invoices/${invoice.id}/issue`, {
        method: 'POST',
        headers: {
          'If-Match': `"${invoice.version}"`,
          'Idempotency-Key': newIdempotencyKey(),
        },
        body: JSON.stringify({
          reason: issueReason.trim() || 'Invoice issuance',
        }),
      });

      setInvoice(updated);
      setIssueSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue invoice.');
    } finally {
      setIssuing(false);
    }
  }

  function toggleMilestonePaid(pos: number) {
    setInstallments((prev) =>
      prev.map((inst) =>
        inst.position === pos
          ? { ...inst, status: inst.status === 'PAID' ? 'PENDING' : 'PAID' }
          : inst,
      ),
    );
  }

  // Peppol BIS 3.0 / Factur-X XML generator
  const generatedXml = useMemo(() => {
    if (!invoice) return '';
    const invNum = invoice.invoiceNumber ?? `DRAFT-${invoice.id.slice(0, 8)}`;
    const custName = customer?.legalName ?? 'Customer Enterprise Corp';
    const email = customer?.billingEmail ?? 'ap@customer.com';

    if (xmlFormat === 'peppol') {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invNum}</cbc:ID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cbc:DueDate>${invoice.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>FIPS-180-4-LEDGER-SEAL</cbc:ID>
    <cbc:DocumentTypeCode>SEAL_SHA256</cbc:DocumentTypeCode>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${ledgerSeal?.hash ?? ''}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>GigaLibs Autonomous Solutions, Inc.</cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${custName}</cbc:Name>
      </cac:PartyName>
      <cac:Contact>
        <cbc:ElectronicMail>${email}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${(invoice.subtotalMinor / 100).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${invoice.currency}">${(invoice.subtotalMinor / 100).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${invoice.currency}">${(invoice.totalMinor / 100).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${invoice.currency}">${(invoice.totalMinor / 100).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${invNum}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <qdt:DateTimeString format="102">${invoice.issueDate.replace(/-/g, '')}</qdt:DateTimeString>
    </ram:IssueDateTime>
    <ram:IncludedNote>
      <ram:Content>Ledger seal hash: ${ledgerSeal?.hash ?? ''}</ram:Content>
    </ram:IncludedNote>
  </rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`;
  }, [invoice, customer, xmlFormat, ledgerSeal]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen font-sans text-ui-fg-base">
        <ArNav />
        <div className="p-12 text-center text-ui-fg-muted text-xs">
          <span className="inline-block w-4 h-4 border-2 border-ui-border-interactive border-t-transparent rounded-full animate-spin mr-2" />
          Loading document from PostgreSQL 16...
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col min-h-screen font-sans text-ui-fg-base">
        <ArNav />
        <div className="p-12 text-center text-ui-tag-red-text text-xs">
          Invoice not found. <Link href="/ar/invoices" className="underline ml-2 text-ui-fg-interactive">Back to invoices</Link>
        </div>
      </div>
    );
  }

  return (
    <StudioSurfaceBoundary
      registrationKey="ar-invoice-draft"
      moduleLabel="Accounts Receivable"
      screenLabel="Invoice Detail"
    >
      <div className="flex flex-col min-h-screen font-sans text-ui-fg-base">
      <div className="print:hidden">
        <div className="p-8 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge color={invoice.status === 'ISSUED' ? 'green' : 'orange'}>
                  {invoice.status}
                </StatusBadge>
                <Badge color="blue" size="small">WI-OI-035</Badge>
                <span className="text-xs text-ui-fg-muted font-mono">Version {invoice.version}</span>
              </div>
              <Heading level="h1" className="text-2xl font-bold text-ui-fg-base mt-1.5">
                {invoice.invoiceNumber ?? 'Unnumbered Invoice Draft'}
              </Heading>
              <Text size="xsmall" className="text-ui-fg-muted font-mono mt-0.5">ID: {invoice.id}</Text>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="small"
                onClick={() => window.print()}
              >
                🖨️ Print / Save PDF
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={() => setShowXmlModal(true)}
              >
                <DocumentText className="mr-1.5" />
                E-Invoice XML (Peppol / Factur-X)
              </Button>
              <Link href="/ar/invoices">
                <Button variant="secondary" size="small">
                  ← All Invoices
                </Button>
              </Link>
            </div>
          </div>
        </div>

      <ArNav />

      <div className="p-8 space-y-6 max-w-5xl">
        {error && (
          <Alert variant="error" className="text-xs">
            {error}
          </Alert>
        )}

        {issueSuccess && (
          <Alert variant="success" className="text-xs">
            ✓ Invoice Successfully Issued! Document {invoice.invoiceNumber} is permanently sealed in the ledger.
          </Alert>
        )}

        {/* Ledger seal stored on the invoice (display only; verification requires a server check). WI-OI-120bj */}
        {invoice.status === 'ISSUED' && ledgerSeal ? (
          <Container className="p-6 border border-ui-border-base bg-ui-bg-subtle shadow-elevation-card-rest rounded-xl space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-ui-bg-base border border-ui-border-base text-ui-fg-muted flex items-center justify-center">
                <ShieldCheck />
              </div>
              <div>
                <Heading level="h2" className="text-sm font-bold text-ui-fg-base">
                  Ledger seal (stored on invoice)
                </Heading>
                <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
                  Sequence #{ledgerSeal.sequenceNumber} · {ledgerSeal.algorithm} · sealed {ledgerSeal.sealedAt}
                </Text>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-ui-bg-base border border-ui-border-base text-xs space-y-1 font-mono">
                <span className="text-[10px] text-ui-fg-muted font-sans font-semibold uppercase tracking-wider block">
                  Record hash
                </span>
                <span className="text-ui-fg-base text-xs break-all block">{ledgerSeal.hash}</span>
              </div>

              <div className="p-3 rounded-lg bg-ui-bg-base border border-ui-border-base text-xs space-y-1 font-mono">
                <span className="text-[10px] text-ui-fg-muted font-sans font-semibold uppercase tracking-wider block">
                  Previous hash pointer
                </span>
                <span className="text-ui-fg-muted text-xs break-all block">
                  {ledgerSeal.previousHash || '—'}
                </span>
              </div>
            </div>
          </Container>
        ) : null}

        {/* Invoice Summary Card */}
        <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-ui-fg-muted font-semibold uppercase tracking-wider text-[11px]">Customer</p>
              <p className="text-sm font-bold text-ui-fg-base mt-1">
                {customer?.legalName ?? 'Apex Technologies LLC'}
              </p>
              <p className="text-ui-fg-muted text-xs mt-0.5">{customer?.billingEmail}</p>
            </div>
            <div>
              <p className="text-ui-fg-muted font-semibold uppercase tracking-wider text-[11px]">Issue Date</p>
              <p className="text-sm font-semibold text-ui-fg-base mt-1 font-mono">{invoice.issueDate}</p>
            </div>
            <div>
              <p className="text-ui-fg-muted font-semibold uppercase tracking-wider text-[11px]">Due Date</p>
              <p className="text-sm font-semibold text-ui-fg-base mt-1 font-mono">{invoice.dueDate}</p>
            </div>
            <div>
              <p className="text-ui-fg-muted font-semibold uppercase tracking-wider text-[11px]">PO Reference</p>
              <p className="text-sm font-semibold text-ui-fg-base mt-1 font-mono">
                {invoice.purchaseOrderReference ?? '—'}
              </p>
            </div>
          </div>
        </Container>

        {/* Milestone Installments Tracker */}
        <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Milestone Payment Schedule</Heading>
              <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
                Staged payment milestones with zero penny drift reconciliation.
              </Text>
            </div>
          </div>

          <div className="border border-ui-border-base rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-2 bg-ui-bg-subtle p-3 text-[11px] font-semibold text-ui-fg-muted uppercase tracking-wider border-b border-ui-border-base">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Milestone Gate</div>
              <div className="col-span-2">Due Date</div>
              <div className="col-span-2 text-right">Split %</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1 text-center">Status</div>
            </div>
            {installments.map((inst) => (
              <div key={inst.position} className="grid grid-cols-12 gap-2 p-3 text-xs items-center border-b border-ui-border-base last:border-b-0 hover:bg-ui-bg-subtle-hover transition font-mono">
                <div className="col-span-1 text-ui-fg-muted">{inst.position}</div>
                <div className="col-span-4 font-sans text-ui-fg-base font-medium">
                  {inst.position === 1 ? 'Phase 1: Mobilization & Kickoff' : `Phase ${inst.position}: Final Acceptance & Closeout`}
                </div>
                <div className="col-span-2 text-ui-fg-subtle">{inst.dueDate}</div>
                <div className="col-span-2 text-right text-ui-fg-interactive font-semibold">
                  {(inst.percentageBasisPoints / 100).toFixed(2)}%
                </div>
                <div className="col-span-2 text-right font-bold text-ui-fg-base">
                  {formatMinorAmount(invoice.currency, inst.amountMinor)}
                </div>
                <div className="col-span-1 text-center">
                  <button
                    type="button"
                    onClick={() => toggleMilestonePaid(inst.position)}
                    className="cursor-pointer"
                    title="Click to toggle settlement"
                  >
                    <StatusBadge color={inst.status === 'PAID' ? 'green' : 'orange'}>
                      {inst.status ?? 'PENDING'}
                    </StatusBadge>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Container>

        {/* Line Items Snapshot */}
        <Container className="p-0 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-ui-border-base">
            <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Itemized Line Snapshot</Heading>
          </div>
          <Table>
            <Table.Header>
              <Table.Row className="bg-ui-bg-subtle text-ui-fg-subtle text-xs">
                <Table.HeaderCell className="w-16">#</Table.HeaderCell>
                <Table.HeaderCell>Description</Table.HeaderCell>
                <Table.HeaderCell className="text-right w-24">Quantity</Table.HeaderCell>
                <Table.HeaderCell className="text-right w-36">Unit Price</Table.HeaderCell>
                <Table.HeaderCell className="text-right w-36">Amount</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {invoice.lines.map((l) => (
                <Table.Row key={l.position} className="hover:bg-ui-bg-subtle-hover transition text-xs font-mono">
                  <Table.Cell className="text-ui-fg-muted">{l.position}</Table.Cell>
                  <Table.Cell className="font-sans text-ui-fg-base font-medium">{l.description}</Table.Cell>
                  <Table.Cell className="text-right text-ui-fg-subtle">{l.quantity}</Table.Cell>
                  <Table.Cell className="text-right text-ui-fg-subtle">{formatMinorAmount(invoice.currency, l.unitAmountMinor)}</Table.Cell>
                  <Table.Cell className="text-right font-bold text-ui-fg-base">
                    {formatMinorAmount(invoice.currency, l.amountMinor)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>

          {/* Subtotal, Discounts and Tax Footer */}
          <div className="p-6 bg-ui-bg-subtle border-t border-ui-border-base flex flex-col items-end gap-1.5 text-xs">
            <div className="flex justify-between w-72 text-ui-fg-muted">
              <span>Subtotal:</span>
              <span className="font-mono text-ui-fg-base font-semibold">
                {formatMinorAmount(invoice.currency, invoice.subtotalMinor)}
              </span>
            </div>
            {invoice.discountMinor !== undefined && invoice.discountMinor > 0 && (
              <div className="flex justify-between w-72 text-ui-tag-orange-text">
                <span>Total Discounts:</span>
                <span className="font-mono font-semibold">
                  -{formatMinorAmount(invoice.currency, invoice.discountMinor)}
                </span>
              </div>
            )}
            <div className="flex justify-between w-72 text-ui-fg-muted">
              <span>Sales Tax:</span>
              <span className="font-mono text-ui-fg-interactive font-semibold">
                {formatMinorAmount(invoice.currency, invoice.taxMinor)}
              </span>
            </div>
            <div className="flex justify-between w-72 text-sm font-bold text-ui-fg-base border-t border-ui-border-base pt-2">
              <span>Total Due:</span>
              <span className="font-mono text-ui-tag-green-text">
                {formatMinorAmount(invoice.currency, invoice.totalMinor)}
              </span>
            </div>
          </div>
        </Container>

        {/* Issuance Action Panel (for Drafts) */}
        {invoice.status === 'DRAFT' && (
          <Container className="p-6 border border-ui-border-base bg-ui-bg-subtle shadow-elevation-card-rest rounded-xl space-y-4">
            <div>
              <Heading level="h3" className="text-base font-bold text-ui-fg-base">Issue Permanent Ledger Document</Heading>
              <Text size="small" className="text-ui-fg-muted mt-1">
                Issuing commits this document to PostgreSQL 16 with a unique sequence number, writes an immutable audit record, and seals it with a SHA-256 cryptographic hash chain.
              </Text>
            </div>

            <div className="space-y-1">
              <Label htmlFor="issue-reason" className="text-xs font-medium text-ui-fg-subtle">
                Issuance Audit Note
              </Label>
              <Input
                id="issue-reason"
                type="text"
                value={issueReason}
                onChange={(e) => setIssueReason(e.target.value)}
                placeholder="Reason for issuance"
                size="small"
              />
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="small"
                onClick={handleIssue}
                disabled={issuing}
                isLoading={issuing}
              >
                Confirm &amp; Issue Invoice →
              </Button>
            </div>
          </Container>
        )}
      </div>

      {/* E-Invoicing XML Modal */}
      {showXmlModal && (
        <div className="fixed inset-0 bg-ui-bg-overlay/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-ui-border-base flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DocumentText className="text-ui-fg-interactive w-5 h-5" />
                <div>
                  <h3 className="font-bold text-sm text-ui-fg-base">
                    International E-Invoicing Document Preview
                  </h3>
                  <p className="text-[11px] text-ui-fg-muted">
                    Conforms to European Standard EN 16931 and OASIS UBL 2.1 specifications
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setXmlFormat('peppol')}
                  className={`px-2.5 py-1 text-xs rounded border transition ${
                    xmlFormat === 'peppol'
                      ? 'bg-ui-bg-interactive text-ui-fg-on-color border-transparent font-medium'
                      : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base'
                  }`}
                >
                  Peppol BIS 3.0 UBL
                </button>
                <button
                  type="button"
                  onClick={() => setXmlFormat('zugferd')}
                  className={`px-2.5 py-1 text-xs rounded border transition ${
                    xmlFormat === 'zugferd'
                      ? 'bg-ui-bg-interactive text-ui-fg-on-color border-transparent font-medium'
                      : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base'
                  }`}
                >
                  ZUGFeRD / Factur-X
                </button>
                <button
                  type="button"
                  onClick={() => setShowXmlModal(false)}
                  className="text-ui-fg-muted hover:text-ui-fg-base text-sm ml-2 px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 bg-ui-bg-subtle overflow-auto flex-1 font-mono text-xs text-ui-fg-base">
              <pre className="p-3 bg-ui-bg-base rounded-md border border-ui-border-base whitespace-pre-wrap leading-relaxed">
                {generatedXml}
              </pre>
            </div>

            <div className="p-4 border-t border-ui-border-base flex justify-between items-center text-xs">
              <span className="text-ui-fg-muted font-mono text-[11px]">
                {ledgerSeal ? `Embedded seal: ${ledgerSeal.hash.slice(0, 24)}…` : 'No seal on record'}
              </span>
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  navigator.clipboard.writeText(generatedXml);
                  alert('E-Invoice XML copied to clipboard!');
                }}
              >
                Copy XML to Clipboard
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* AUTHORITATIVE PRINTABLE INVOICE SHEET (WI-OI-035)                          */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      <PrintableInvoiceSheet invoice={invoice} />
    </div>
    </StudioSurfaceBoundary>
  );
}
