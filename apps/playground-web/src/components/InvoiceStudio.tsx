import * as React from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  StatusBadge,
  Input,
  Modal,
} from '@gigalibs/ui';
import {
  InvoiceEngine,
  TaxEngine,
  NumberingSequencer,
  CostPlusMarkupCalculator,
  SubInvoiceSequencer,
  BillableItemLockManager,
  InvoiceVoidManager,
  AccountingSyncBridge,
  type Invoice,
  type InvoiceLineItem,
  type CustomerBillingProfile,
  type PaymentTerms,
  type RecurringCadence,
  type ClientMasterRecord,
  type ProductCatalogItem,
  type CompanyInvoiceSettings,
  type BillableSourceItem,
  type ProjectWipSummary,
  type AccountingSyncRecord,
} from '@gigalibs/invoices-core';
import { MultiCurrencyEngine } from '@gigalibs/multi-currency';
import { PdfGenerator } from '@gigalibs/export-engine-core';
import { ApiClient } from '../api-client.js';

// ─── INITIAL MOCK SEED DATA (INVOICENINJA ENTERPRISE STANDARD) ───────────────

const INITIAL_CLIENTS: ClientMasterRecord[] = [
  {
    id: 'cli_warner',
    accountNumber: 'CUST-1001',
    name: 'Warner Bros Discovery & HBO',
    dba: 'Warner Bros Television Production',
    email: 'production-ap@wbd.com',
    phone: '+1 (818) 954-6000',
    website: 'https://wbd.com',
    country: 'US',
    stateOrProvince: 'CA',
    city: 'Burbank',
    postalCode: '91522',
    addressLine1: '4000 Warner Blvd',
    taxIdentifier: 'US-EIN-95-1298412',
    isTaxExempt: false,
    defaultCurrency: 'USD',
    defaultPaymentTerms: 'NET_15',
    notes: 'Primary production client for commercial filming and stage rentals.',
    totalInvoicedCents: 3383738,
    totalPaidCents: 0,
    outstandingBalanceCents: 3383738,
    status: 'ACTIVE',
    createdAt: '2026-01-10',
  },
  {
    id: 'cli_espn',
    accountNumber: 'CUST-1002',
    name: 'ESPN Sports Network',
    dba: 'The Walt Disney Company (Broadcast)',
    email: 'broadcast-ap@espn.com',
    phone: '+1 (860) 766-2000',
    website: 'https://espn.com',
    country: 'US',
    stateOrProvince: 'TX',
    city: 'Austin',
    postalCode: '78701',
    addressLine1: '100 Congress Ave, Suite 1400',
    taxIdentifier: 'US-EIN-06-1049281',
    isTaxExempt: false,
    defaultCurrency: 'USD',
    defaultPaymentTerms: 'NET_30',
    notes: 'Live sports broadcasting crew and OB truck provider.',
    totalInvoicedCents: 6500688,
    totalPaidCents: 0,
    outstandingBalanceCents: 6500688,
    status: 'ACTIVE',
    createdAt: '2026-02-01',
  },
  {
    id: 'cli_netflix',
    accountNumber: 'CUST-1003',
    name: 'Netflix Studios Europe B.V.',
    email: 'emea-finance@netflix.com',
    phone: '+31 20 703 8900',
    website: 'https://netflix.com',
    country: 'DE',
    stateOrProvince: 'BE',
    city: 'Berlin',
    postalCode: '10117',
    addressLine1: 'Friedrichstraße 88',
    taxIdentifier: 'EU-VAT-NL820790123B01',
    isTaxExempt: true,
    defaultCurrency: 'EUR',
    defaultPaymentTerms: 'NET_30',
    notes: 'EU B2B Reverse Charge tax exempt entity.',
    totalInvoicedCents: 4500000,
    totalPaidCents: 4500000,
    outstandingBalanceCents: 0,
    status: 'ACTIVE',
    createdAt: '2026-03-15',
  },
];

const INITIAL_PRODUCTS: ProductCatalogItem[] = [
  {
    id: 'prod_dp',
    sku: 'SRV-CREW-DP',
    name: 'Director of Photography (DP) - Principal',
    description: 'Senior cinematographic director for 4K/8K principal photography shoots.',
    category: 'Crew / Labor',
    unitPriceCents: 250000, // $2,500.00
    unitMetric: 'Days',
    isActive: true,
  },
  {
    id: 'prod_gaffer',
    sku: 'SRV-CREW-GAF',
    name: 'Gaffer & Key Grip Technical Lighting Crew',
    description: 'Lighting master and rigging lead with high-output HMI/LED setups.',
    category: 'Crew / Labor',
    unitPriceCents: 180000, // $1,800.00
    unitMetric: 'Days',
    isActive: true,
  },
  {
    id: 'prod_alexa35',
    sku: 'EQP-CAM-ALX35',
    name: 'ARRI Alexa 35 4K Cinema Camera Package',
    description: 'Includes ARRI Master Primes, matte box, follow focus, and 2TB codex drives.',
    category: 'Equipment / Cameras',
    unitPriceCents: 850000, // $8,500.00
    unitMetric: 'Weeks',
    isActive: true,
  },
  {
    id: 'prod_cloud_db',
    sku: 'SFT-CLOUD-DEDDB',
    name: 'Dedicated PostgreSQL RDS Infrastructure',
    description: 'Multi-AZ high availability dedicated database cluster with 99.99% SLA.',
    category: 'Cloud / Infrastructure',
    unitPriceCents: 3700000, // $37,000.00
    unitMetric: 'Flat',
    isActive: true,
  },
  {
    id: 'prod_saas_seat',
    sku: 'LIC-SAAS-PRO',
    name: 'GigaPlatform Enterprise Seat License',
    description: 'Per-user seat license with AI copilot and unlimited workflow runs.',
    category: 'Software License',
    unitPriceCents: 9900, // $99.00
    unitMetric: 'Seats',
    isActive: true,
  },
];

const INITIAL_SETTINGS: CompanyInvoiceSettings = {
  companyName: 'Warner Bros Discovery Operations LLC',
  companyTaxId: 'US-EIN-95-1298412',
  companyAddressLine1: '4000 Warner Blvd, Bldg 15',
  companyCityStateZip: 'Burbank, CA 91522',
  companyCountry: 'USA',
  companyEmail: 'invoicing-desk@wbd.com',
  companyPhone: '+1 (818) 954-6000',
  companyWebsite: 'https://wbd.com',
  logoUrl: 'https://assets.gigalibs.dev/logos/warner.svg',
  brandColorHex: '#003366', // Deep Warner Blue
  headerLayout: 'MODERN_NAVY',
  invoicePrefix: 'WBD-2026-',
  nextInvoiceNumber: 1001,
  numberPadding: 4,
  defaultPaymentTerms: 'NET_15',
  bankName: 'JPMorgan Chase Commercial Banking',
  bankRoutingNumber: '122000496',
  bankAccountNumber: '••••••8941',
  bankSwiftBic: 'CHASUS33',
  defaultNotes: 'Payment is due per designated terms. Wire and ACH remittance accepted. Thank you for your partnership.',
};

export interface InvoiceStudioProps {
  onNavigateTab?: (tab: string) => void;
  isDemoView?: boolean;
}

export function InvoiceStudio({ onNavigateTab }: InvoiceStudioProps = {}) {
  // Master Studio Tabs
  const [activeTab, setActiveTab] = React.useState<
    'invoices' | 'wip_burndown' | 'cost_plus_margins' | 'clients' | 'products' | 'settings'
  >('invoices');

  // State: Settings & Branding
  const [settings, setSettings] = React.useState<CompanyInvoiceSettings>(INITIAL_SETTINGS);

  // State: Clients Directory
  const [clients, setClients] = React.useState<ClientMasterRecord[]>(INITIAL_CLIENTS);
  const [clientSearchQuery, setClientSearchQuery] = React.useState('');
  const [isAddClientModalOpen, setIsAddClientModalOpen] = React.useState(false);

  // State: Products Catalog
  const [products, setProducts] = React.useState<ProductCatalogItem[]>(INITIAL_PRODUCTS);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = React.useState(false);

  // State: Invoices List
  const [invoices, setInvoices] = React.useState<any[]>([]);
  const [filterStatus, setFilterStatus] = React.useState<string>('ALL');
  const [selectedInvoice, setSelectedInvoice] = React.useState<any | null>(null);

  // WIP & Incremental Sub-Invoicing State
  const [selectedProjectId, setSelectedProjectId] = React.useState('EVT-2026-WARNER-STAGE4');
  const [wipSummary, setWipSummary] = React.useState<ProjectWipSummary | null>(null);
  const [billableRecords, setBillableRecords] = React.useState<BillableSourceItem[]>([]);
  const [isGeneratingSubInvoice, setIsGeneratingSubInvoice] = React.useState(false);
  const [defaultMarkupPercent, setDefaultMarkupPercent] = React.useState(35);

  // Void Modal State
  const [isVoidModalOpen, setIsVoidModalOpen] = React.useState(false);
  const [invoiceToVoid, setInvoiceToVoid] = React.useState<any | null>(null);
  const [voidReason, setVoidReason] = React.useState('');

  // Add Shift Modal State
  const [isAddShiftModalOpen, setIsAddShiftModalOpen] = React.useState(false);
  const [newShiftResourceName, setNewShiftResourceName] = React.useState('');
  const [newShiftRole, setNewShiftRole] = React.useState('Camera Operator');
  const [newShiftHours, setNewShiftHours] = React.useState(8);
  const [newShiftPayDollars, setNewShiftPayDollars] = React.useState(45);
  const [newShiftMarkupPct, setNewShiftMarkupPct] = React.useState(35);
  const [newShiftApprovalStatus, setNewShiftApprovalStatus] = React.useState<'PENDING' | 'APPROVED'>('APPROVED');

  // Bulk Import & Webhook State
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = React.useState(false);
  const [isWebhookInfoModalOpen, setIsWebhookInfoModalOpen] = React.useState(false);
  const [bulkImportJson, setBulkImportJson] = React.useState('');

  // State: Invoice Creation Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [selectedClientId, setSelectedClientId] = React.useState<string>(INITIAL_CLIENTS[0]!.id);
  const [invPaymentTerms, setInvPaymentTerms] = React.useState<PaymentTerms>('NET_15');
  const [invCurrency, setInvCurrency] = React.useState('USD');
  const [invDiscountPercent, setInvDiscountPercent] = React.useState(0);
  const [invNotes, setInvNotes] = React.useState(settings.defaultNotes || '');
  const [invLineItems, setInvLineItems] = React.useState<InvoiceLineItem[]>([
    { id: 'li_init_1', description: INITIAL_PRODUCTS[0]!.name, quantity: 2, unitPriceCents: INITIAL_PRODUCTS[0]!.unitPriceCents, taxRatePercent: 7.25, amountCents: INITIAL_PRODUCTS[0]!.unitPriceCents * 2 },
  ]);

  // New Client Form State
  const [newClientName, setNewClientName] = React.useState('');
  const [newClientEmail, setNewClientEmail] = React.useState('');
  const [newClientTaxId, setNewClientTaxId] = React.useState('');
  const [newClientCountry, setNewClientCountry] = React.useState('US');
  const [newClientState, setNewClientState] = React.useState('CA');
  const [newClientCity, setNewClientCity] = React.useState('');
  const [newClientAddress, setNewClientAddress] = React.useState('');
  const [newClientTerms, setNewClientTerms] = React.useState<PaymentTerms>('NET_30');

  // New Product Form State
  const [newProdName, setNewProdName] = React.useState('');
  const [newProdSku, setNewProdSku] = React.useState('');
  const [newProdCategory, setNewProdCategory] = React.useState('Crew / Labor');
  const [newProdPriceDollars, setNewProdPriceDollars] = React.useState(250);
  const [newProdMetric, setNewProdMetric] = React.useState('Days');

  const loadWipData = React.useCallback(async () => {
    try {
      const [summary, records] = await Promise.all([
        ApiClient.getProjectWipSummary(selectedProjectId),
        ApiClient.listBillableRecords(selectedProjectId),
      ]);
      if (summary) setWipSummary(summary);
      if (records) setBillableRecords(records);
    } catch (err) {
      console.warn('WIP loading note:', err);
    }
  }, [selectedProjectId]);

  // Fetch live clients, products, and invoices from PostgreSQL REST API
  React.useEffect(() => {
    async function loadLiveBackendData() {
      try {
        const [liveClients, liveProducts, liveInvoices] = await Promise.allSettled([
          ApiClient.listClients(),
          ApiClient.listProducts(),
          ApiClient.listInvoices(),
        ]);

        if (liveClients.status === 'fulfilled' && liveClients.value?.length > 0) {
          setClients(liveClients.value);
        }
        if (liveProducts.status === 'fulfilled' && liveProducts.value?.length > 0) {
          setProducts(liveProducts.value);
        }
        if (liveInvoices.status === 'fulfilled' && liveInvoices.value?.length > 0) {
          setInvoices(liveInvoices.value);
        }
      } catch (err) {
        console.warn('Live API connection notice:', err);
      }
    }
    loadLiveBackendData();
    loadWipData();
  }, [loadWipData]);

  // Active Client lookup for Invoice modal
  const activeSelectedClient = React.useMemo(() => {
    return clients.find((c) => c.id === selectedClientId) || clients[0];
  }, [clients, selectedClientId]);

  // Tax Resolution for Modal
  const activeTaxConfig = React.useMemo(() => {
    if (!activeSelectedClient) return { ratePercent: 0, description: 'Standard Tax' };
    return TaxEngine.resolveTax({
      customerId: activeSelectedClient.id,
      name: activeSelectedClient.name,
      email: activeSelectedClient.email,
      country: activeSelectedClient.country,
      stateOrProvince: activeSelectedClient.stateOrProvince,
      taxIdentifier: activeSelectedClient.taxIdentifier,
      isTaxExempt: activeSelectedClient.isTaxExempt,
    });
  }, [activeSelectedClient]);

  // Computed Invoice Totals in Modal
  const modalCalculatedTotals = React.useMemo(() => {
    return InvoiceEngine.calculateTotals(invLineItems, invDiscountPercent, activeTaxConfig.ratePercent);
  }, [invLineItems, invDiscountPercent, activeTaxConfig]);

  // Synchronize line items tax rates when active client changes
  React.useEffect(() => {
    setInvLineItems((prev) =>
      prev.map((item) => ({
        ...item,
        taxRatePercent: activeTaxConfig.ratePercent,
      }))
    );
  }, [activeTaxConfig.ratePercent]);

  // Add Item to Invoice from Product Catalog
  const handleAddLineItemFromCatalog = (prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;
    const newItem: InvoiceLineItem = {
      id: `li_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      description: prod.name,
      quantity: 1,
      unitPriceCents: prod.unitPriceCents,
      taxRatePercent: activeTaxConfig.ratePercent,
      amountCents: prod.unitPriceCents,
    };
    setInvLineItems((prev) => [newItem, ...prev]);
  };

  // Add Free-Text Item
  const handleAddBlankLineItem = () => {
    const newItem: InvoiceLineItem = {
      id: `li_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      description: 'Custom Billable Service / Milestone Fee',
      quantity: 1,
      unitPriceCents: 50000,
      taxRatePercent: activeTaxConfig.ratePercent,
      amountCents: 50000,
    };
    setInvLineItems((prev) => [newItem, ...prev]);
  };

  const handleUpdateLineItem = (idx: number, patch: Partial<InvoiceLineItem>) => {
    setInvLineItems((prev) => {
      const updated = [...prev];
      const current = updated[idx]!;
      const merged = { ...current, ...patch };
      if (patch.quantity !== undefined || patch.unitPriceCents !== undefined) {
        merged.amountCents = merged.quantity * merged.unitPriceCents;
      }
      updated[idx] = merged;
      return updated;
    });
  };

  const handleRemoveLineItem = (idx: number) => {
    if (invLineItems.length <= 1) {
      alert('Invoice must contain at least 1 line item.');
      return;
    }
    setInvLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Submit and Create Invoice
  const handleCreateInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSelectedClient) return;

    const generatedNumber = NumberingSequencer.formatInvoiceNumber({
      prefix: settings.invoicePrefix,
      nextNumber: settings.nextInvoiceNumber + invoices.length,
      numberPadding: settings.numberPadding,
    });

    const newInv = InvoiceEngine.createInvoice({
      tenantId: 'acme',
      invoiceNumber: generatedNumber,
      customer: {
        customerId: activeSelectedClient.id,
        name: activeSelectedClient.name,
        email: activeSelectedClient.email,
        country: activeSelectedClient.country,
        stateOrProvince: activeSelectedClient.stateOrProvince,
        taxIdentifier: activeSelectedClient.taxIdentifier,
        isTaxExempt: activeSelectedClient.isTaxExempt,
      },
      currency: invCurrency,
      paymentTerms: invPaymentTerms,
      lineItems: invLineItems,
      discountPercent: invDiscountPercent,
      notes: invNotes,
    });

    setInvoices((prev) => [newInv, ...prev]);
    setIsCreateModalOpen(false);
    setSelectedInvoice(newInv);

    // Commit to real PostgreSQL Database via NestJS REST API
    ApiClient.createInvoice({
      invoiceNumber: generatedNumber,
      customerId: activeSelectedClient.id,
      customerName: activeSelectedClient.name,
      customerEmail: activeSelectedClient.email,
      customerLocation: `${activeSelectedClient.stateOrProvince || 'CA'}, ${activeSelectedClient.country}`,
      currency: invCurrency,
      paymentTerms: invPaymentTerms,
      lineItems: invLineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        amountCents: li.amountCents,
      })),
      subtotalCents: modalCalculatedTotals.subtotalCents,
      taxAmountCents: modalCalculatedTotals.taxAmountCents,
      totalAmountCents: modalCalculatedTotals.totalAmountCents,
      notes: invNotes,
    })
      .then((created) => {
        setInvoices((prev) => [created, ...prev.filter((i) => i.id !== newInv.id && i.invoiceNumber !== created.invoiceNumber)]);
        setSelectedInvoice(created);
      })
      .catch((err) => console.warn('API save note:', err));
  };

  // Add Client Submit
  const handleAddClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientEmail) {
      alert('Please provide client name and email.');
      return;
    }

    const newClient: ClientMasterRecord = {
      id: `cli_${Date.now()}`,
      accountNumber: `CUST-${1000 + clients.length + 1}`,
      name: newClientName,
      email: newClientEmail,
      taxIdentifier: newClientTaxId || undefined,
      country: newClientCountry,
      stateOrProvince: newClientState,
      city: newClientCity,
      addressLine1: newClientAddress,
      defaultCurrency: 'USD',
      defaultPaymentTerms: newClientTerms,
      totalInvoicedCents: 0,
      totalPaidCents: 0,
      outstandingBalanceCents: 0,
      status: 'ACTIVE',
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setClients((prev) => [newClient, ...prev]);
    setSelectedClientId(newClient.id);
    setIsAddClientModalOpen(false);
    setNewClientName('');
    setNewClientEmail('');

    // Commit Client to PostgreSQL Database
    ApiClient.createClient({
      name: newClientName,
      email: newClientEmail,
      taxIdentifier: newClientTaxId || undefined,
      country: newClientCountry,
      stateOrProvince: newClientState,
      city: newClientCity,
      addressLine1: newClientAddress,
      defaultCurrency: 'USD',
      defaultPaymentTerms: newClientTerms,
    }).catch((err) => console.warn('API save note:', err));
  };

  // Add Product Submit
  const handleAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName || !newProdSku) {
      alert('Please provide product name and SKU.');
      return;
    }

    const newProd: ProductCatalogItem = {
      id: `prod_${Date.now()}`,
      sku: newProdSku.toUpperCase(),
      name: newProdName,
      description: `${newProdName} billable unit`,
      category: newProdCategory,
      unitPriceCents: Math.round(newProdPriceDollars * 100),
      unitMetric: newProdMetric,
      isActive: true,
    };

    setProducts((prev) => [newProd, ...prev]);
    setIsAddProductModalOpen(false);
    setNewProdName('');
    setNewProdSku('');

    // Commit Product Rate Card to PostgreSQL Database
    ApiClient.createProduct({
      sku: newProdSku.toUpperCase(),
      name: newProdName,
      description: `${newProdName} billable unit`,
      category: newProdCategory,
      unitPriceCents: Math.round(newProdPriceDollars * 100),
      unitMetric: newProdMetric,
    }).catch((err) => console.warn('API save note:', err));
  };

  // Trigger Branded PDF Download
  const triggerPdfDownload = (inv: Invoice) => {
    const issueDateStr = inv.issueDate || new Date().toISOString().slice(0, 10);
    const dueDateStr = inv.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

    PdfGenerator.downloadInvoicePdf(
      {
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer.name,
        customerEmail: inv.customer.email,
        customerLocation: `${inv.customer.stateOrProvince || 'CA'}, ${inv.customer.country || 'US'}`,
        customerTaxId: inv.customer.taxIdentifier || 'US-EIN-98-12491',
        currency: inv.currency,
        status: inv.status,
        issuedDate: issueDateStr,
        dueDate: dueDateStr,
        paymentTerms: inv.paymentTerms,
        tenantProfile: {
          companyName: settings.companyName,
          companyTaxId: settings.companyTaxId,
          companyAddress: settings.companyAddressLine1,
          companyCityStateZip: settings.companyCityStateZip,
          companyCountry: settings.companyCountry,
          brandColorHex: settings.brandColorHex,
        },
        lineItems: inv.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: MultiCurrencyEngine.format(li.unitPriceCents, inv.currency),
          amount: MultiCurrencyEngine.format(li.amountCents, inv.currency),
        })),
        subtotal: MultiCurrencyEngine.format(inv.subtotalCents, inv.currency),
        discount: inv.globalDiscountCents > 0 ? MultiCurrencyEngine.format(inv.globalDiscountCents, inv.currency) : undefined,
        tax: MultiCurrencyEngine.format(inv.taxAmountCents, inv.currency),
        total: MultiCurrencyEngine.format(inv.totalAmountCents, inv.currency),
        amountPaid: MultiCurrencyEngine.format(inv.amountPaidCents, inv.currency),
        balanceDue: MultiCurrencyEngine.format(inv.balanceDueCents, inv.currency),
        digestSha256: inv.id,
      },
      `${inv.invoiceNumber}.pdf`,
    );
  };

  const handleMarkPaid = async (inv: any) => {
    try {
      const identifier = inv.id || inv.invoiceNumber;
      const updated = await ApiClient.markInvoicePaid(identifier);
      setInvoices((prev) =>
        prev.map((i) =>
          i.id === inv.id || i.invoiceNumber === inv.invoiceNumber
            ? { ...i, ...updated, status: 'PAID', balanceDueCents: 0, amountDueCents: 0, amountPaidCents: i.totalAmountCents || i.totalCents }
            : i
        )
      );
      if (selectedInvoice?.id === inv.id || selectedInvoice?.invoiceNumber === inv.invoiceNumber) {
        setSelectedInvoice((prev: any) => ({
          ...prev,
          status: 'PAID',
          balanceDueCents: 0,
          amountDueCents: 0,
          amountPaidCents: prev?.totalAmountCents || prev?.totalCents,
        }));
      }
      alert(`✓ Invoice #${inv.invoiceNumber} marked as PAID!\n• Amount Collected: $${(((inv.totalAmountCents || inv.totalCents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}\n• Payment settlement transaction posted to General Ledger.`);
    } catch (err: any) {
      alert(`Payment recording failed: ${err.message}`);
    }
  };

  const handleGenerateIncrementalInvoice = async () => {
    setIsGeneratingSubInvoice(true);
    try {
      const generated = await ApiClient.generateIncrementalInvoice({
        projectOrEventId: selectedProjectId,
        customerName: activeSelectedClient?.name || 'Warner Bros Discovery',
        defaultMarkupPercent,
      });
      setSelectedInvoice(generated);
    } catch (err: any) {
      alert(`Incremental Invoicing Failed: ${err.message}`);
    } finally {
      setIsGeneratingSubInvoice(false);
    }
  };

  const handleExecuteVoid = async () => {
    if (!invoiceToVoid || !voidReason.trim()) {
      alert('Please enter a documented reason for voiding this invoice.');
      return;
    }
    try {
      await ApiClient.voidInvoice(invoiceToVoid.id, voidReason, 'Alex Rivera (Billing Admin)');
      alert(`🚫 Invoice ${invoiceToVoid.invoiceNumber} has been VOIDED.\n• Reason: "${voidReason}"\n• Associated billable shift records unlocked back to UNBILLED.\n• Reversal ledger entry posted to General Ledger.`);
      setIsVoidModalOpen(false);
      setVoidReason('');
      setInvoiceToVoid(null);
      const refreshedInvoices = await ApiClient.listInvoices();
      setInvoices(refreshedInvoices);
      loadWipData();
    } catch (err: any) {
      alert(`Void failed: ${err.message}`);
    }
  };

  const handleSyncQbo = async (invId: string) => {
    try {
      const result = await ApiClient.syncToAccounting(invId, 'QUICKBOOKS_ONLINE');
      alert(`☁️ Synchronized to QuickBooks Online!\n• Status: ${result.syncStatus}\n• QBO Invoice ID: ${result.externalInvoiceId}\n• Timestamp: ${new Date(result.syncedAt).toLocaleTimeString()}`);
      const refreshedInvoices = await ApiClient.listInvoices();
      setInvoices(refreshedInvoices);
    } catch (err: any) {
      alert(`Accounting sync failed: ${err.message}`);
    }
  };

  const handleSetApproval = async (recordId: string, approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    setBillableRecords((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, approvalStatus } : r))
    );
    try {
      await ApiClient.updateBillableApproval(recordId, approvalStatus);
      loadWipData();
    } catch (err: any) {
      alert(`Approval update failed: ${err.message}`);
      loadWipData();
    }
  };

  const handleCreateShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftResourceName.trim()) {
      alert('Please enter specialist/resource name.');
      return;
    }

    try {
      await ApiClient.createBillableRecord({
        sourceType: 'TIMESHEET_SHIFT',
        sourceId: `TS-SHIFT-MANUAL-${Date.now().toString().slice(-4)}`,
        projectOrEventId: selectedProjectId || 'EVT-2026-WARNER-STAGE4',
        projectOrEventName: 'Warner Bros Stage 4 Production Shoot',
        resourceName: newShiftResourceName.trim(),
        resourceRole: newShiftRole || 'Camera Operator',
        quantity: Math.max(1, Math.round(Number(newShiftHours) || 1)),
        rawCostCents: Math.round((Number(newShiftPayDollars) || 45) * 100),
        markupType: 'PERCENTAGE',
        markupValue: Number(newShiftMarkupPct) || 35,
        approvalStatus: newShiftApprovalStatus || 'APPROVED',
      });

      setIsAddShiftModalOpen(false);
      setNewShiftResourceName('');
      loadWipData();
      alert('✓ Billable shift successfully logged into PostgreSQL WIP ledger!');
    } catch (err: any) {
      alert(`Failed to log shift: ${err.message}`);
    }
  };

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let recordsToImport: any[] = [];
      if (bulkImportJson.trim()) {
        recordsToImport = JSON.parse(bulkImportJson);
      } else {
        // Preset sample batch from external timesheet system (3 approved shifts)
        recordsToImport = [
          { resourceName: 'Marcus Vance', resourceRole: 'Grip & Rigging Lead', quantity: 10, rawCostCents: 4200, markupValue: 35, approvalStatus: 'APPROVED' },
          { resourceName: 'Elena Rostova', resourceRole: 'Boom Operator & Sound', quantity: 10, rawCostCents: 3900, markupValue: 35, approvalStatus: 'APPROVED' },
          { resourceName: 'David Chen', resourceRole: 'DIT & Color Calibration', quantity: 8, rawCostCents: 5200, markupValue: 35, approvalStatus: 'APPROVED' },
        ].map((r, i) => ({
          ...r,
          projectOrEventId: selectedProjectId,
          projectOrEventName: 'Warner Bros Stage 4 Shoot',
          sourceType: 'TIMESHEET_SHIFT',
          sourceId: `TS-KRONOS-EXT-${Date.now().toString().slice(-4)}-${i + 1}`,
          markupType: 'PERCENTAGE',
        }));
      }

      const res = await ApiClient.bulkImportBillableRecords(recordsToImport);
      setIsBulkImportModalOpen(false);
      setBulkImportJson('');
      loadWipData();
      alert(`📥 Successfully imported ${res.importedCount} timesheets from external system!`);
    } catch (err: any) {
      alert(`Bulk import error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & 6-Pillar Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>💰 Enterprise Invoicing, WIP & Sub-Billing Suite</span>
            <Badge variant="info">Time & Materials + Cost-Plus Standard</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            Universal Work-in-Progress (WIP) Burndown, Multi-Round Incremental Sub-Invoicing (<code>-SUB1</code>, <code>-SUB2</code>), Two-Phase Locking, and QuickBooks Online ERP Sync.
          </p>
        </div>

        {/* 6-Pillar Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
          {[
            { id: 'invoices', label: `📑 Invoices & AR (${invoices.length})` },
            { id: 'wip_burndown', label: `⏱️ WIP & Sub-Invoicing (${wipSummary?.readyToBillCount ?? 0} Ready)` },
            { id: 'cost_plus_margins', label: `📊 Cost-Plus & Margins` },
            { id: 'clients', label: `👥 Client Directory (${clients.length})` },
            { id: 'products', label: `📦 Rate Catalog (${products.length})` },
            { id: 'settings', label: '⚙️ Branding & Numbering' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 1: INVOICES & AR LEDGER (WITH PARENT/SUB-INVOICE TREE & QBO SYNC)
          ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex justify-between items-center">
            <div className="flex space-x-2 text-xs font-bold">
              {['ALL', 'OPEN', 'SENT', 'PAID', 'VOID', 'OVERDUE'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition text-xs cursor-pointer ${
                    filterStatus === st ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={() => setActiveTab('wip_burndown')} className="!bg-emerald-600 hover:!bg-emerald-500 !text-white font-bold text-xs shadow-sm">
                ⚡ Incremental Sub-Invoice Generator
              </Button>
              <Button size="sm" onClick={() => setIsCreateModalOpen(true)} className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs shadow-sm">
                + Create Custom Invoice 🚀
              </Button>
            </div>
          </div>

          {/* High-Contrast KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-white border border-slate-200 shadow-sm hover:border-indigo-300 transition">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Total Invoiced (Gross)</span>
              <div className="text-2xl font-black text-indigo-600 mt-1 font-sans">
                {MultiCurrencyEngine.format(invoices.filter(i => i.status !== 'VOID').reduce((sum, i) => sum + (i.totalCents || i.totalAmountCents || 0), 0), 'USD')}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">{invoices.length} Registered Headers</span>
            </Card>

            <Card className="p-4 bg-white border border-emerald-200 shadow-sm hover:border-emerald-400 transition">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 font-bold block">Collected Cash</span>
              <div className="text-2xl font-black text-emerald-600 mt-1 font-sans">
                {MultiCurrencyEngine.format(invoices.reduce((sum, i) => sum + (i.amountPaidCents || 0), 0), 'USD')}
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] inline-block mt-0.5">
                ✓ Settled & Reconciled
              </span>
            </Card>

            <Card className="p-4 bg-white border border-amber-200 shadow-sm hover:border-amber-400 transition">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-700 font-bold block">Outstanding Receivables</span>
              <div className="text-2xl font-black text-amber-600 mt-1 font-sans">
                {MultiCurrencyEngine.format(invoices.filter(i => i.status !== 'VOID' && i.status !== 'PAID').reduce((sum, i) => sum + (i.amountDueCents || i.balanceDueCents || 0), 0), 'USD')}
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px] inline-block mt-0.5">
                ⏳ Pending Settlement
              </span>
            </Card>

            <Card className="p-4 bg-white border border-purple-200 shadow-sm hover:border-purple-400 transition">
              <span className="text-[10px] font-mono uppercase tracking-wider text-purple-700 font-bold block">QuickBooks Online Sync</span>
              <div className="text-2xl font-black text-purple-600 mt-1 font-sans">
                {invoices.filter(i => i.accountingSyncs?.some((s: any) => s.syncStatus === 'SYNCED')).length} / {invoices.length}
              </div>
              <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold text-[10px] inline-block mt-0.5">
                ☁️ QBO Cloud Connected
              </span>
            </Card>
          </div>

          {/* Invoices List Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">Invoice # & Hierarchy</th>
                      <th className="p-3">Client Account / Project</th>
                      <th className="p-3">Issue Date</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3 text-right">Total Amount</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">ERP / QBO Sync</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices
                      .filter((inv) => filterStatus === 'ALL' || inv.status === filterStatus)
                      .map((inv) => {
                        const isSubInvoice = inv.subSequenceIndex > 0 || inv.invoiceNumber?.includes('-SUB');
                        const isSynced = inv.accountingSyncs?.some((s: any) => s.syncStatus === 'SYNCED');
                        const customerName = inv.customer?.name || inv.customerName || 'Warner Bros Discovery';
                        const customerEmail = inv.customer?.email || inv.customerEmail || 'production-ap@wbd.com';
                        const issueDate = inv.issueDate || (inv.createdAt ? new Date(inv.createdAt).toISOString().slice(0, 10) : '2026-08-10');
                        const dueDate = inv.dueDate ? (typeof inv.dueDate === 'string' ? inv.dueDate.slice(0, 10) : new Date(inv.dueDate).toISOString().slice(0, 10)) : '2026-09-09';
                        const totalCents = inv.totalCents ?? inv.totalAmountCents ?? 0;

                        return (
                          <tr key={inv.id} className={`hover:bg-slate-50/80 transition ${inv.status === 'VOID' ? 'opacity-60 bg-rose-50/20' : ''}`}>
                            <td className="p-3 font-mono font-bold text-indigo-600">
                              <div className="flex items-center gap-1.5">
                                {isSubInvoice && <span className="text-slate-400 font-normal">↳</span>}
                                <span>{inv.invoiceNumber}</span>
                                {isSubInvoice && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                    Round {inv.subSequenceIndex || 1}
                                  </span>
                                )}
                              </div>
                              {inv.parentInvoiceId && (
                                <div className="text-[10px] font-normal text-slate-400">Parent: {inv.parentInvoiceId.slice(-8)}</div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-slate-900">{customerName}</div>
                              <div className="text-[10px] font-mono text-slate-400">{customerEmail} {inv.projectOrEventId ? `• ${inv.projectOrEventId}` : ''}</div>
                            </td>
                            <td className="p-3 font-mono text-slate-600">{issueDate}</td>
                            <td className="p-3 font-mono text-slate-600">{dueDate}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">
                              {MultiCurrencyEngine.format(totalCents, inv.currency || 'USD')}
                            </td>
                            <td className="p-3 text-center">
                              <StatusBadge variant={inv.status === 'PAID' ? 'success' : inv.status === 'VOID' ? 'danger' : inv.status === 'OVERDUE' ? 'danger' : 'info'}>
                                {inv.status}
                              </StatusBadge>
                              {inv.voidReason && (
                                <div className="text-[9px] text-rose-600 italic mt-0.5">"{inv.voidReason}"</div>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {isSynced ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] inline-flex items-center gap-1">
                                  ☁️ QBO Synced
                                </span>
                              ) : inv.status === 'VOID' ? (
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px]">
                                  Skipped
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleSyncQbo(inv.id)}
                                  className="px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                                >
                                  ⏳ Sync to QBO
                                </button>
                              )}
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap shrink-0">
                                <Button size="sm" variant="outline" onClick={() => setSelectedInvoice(inv)} className="text-xs whitespace-nowrap">
                                  View 📄
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => triggerPdfDownload(inv)}
                                  className="!bg-indigo-50 !border-indigo-200 !text-indigo-700 hover:!bg-indigo-100 text-xs font-bold whitespace-nowrap"
                                >
                                  PDF 📥
                                </Button>
                                {inv.status !== 'PAID' && inv.status !== 'VOID' && (
                                  <>
                                    <Button size="sm" onClick={() => handleMarkPaid(inv)} className="!bg-emerald-600 hover:!bg-emerald-500 !text-white text-xs whitespace-nowrap">
                                      Paid ✓
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setInvoiceToVoid(inv);
                                        setIsVoidModalOpen(true);
                                      }}
                                      className="!bg-rose-50 hover:!bg-rose-100 !text-rose-700 !border-rose-200 text-xs whitespace-nowrap"
                                    >
                                      Void 🚫
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 2: WORK ORDER & PROJECT WIP BURNDOWN & SUB-INVOICING STUDIO
          ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'wip_burndown' && (
        <div className="space-y-6">
          {/* WIP Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gradient-to-r from-indigo-900 to-slate-900 rounded-2xl text-white">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-300 font-bold block">
                Production Event / Work Order WIP
              </span>
              <h3 className="text-lg font-black mt-0.5 flex items-center gap-2">
                <span>🎬 Warner Bros Stage 4 Production Shoot</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-800/80 text-indigo-200">
                  {selectedProjectId}
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Multi-round time & materials billing: Approvals sync automatically from workforce shifts and lock upon invoice finalization.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => setIsAddShiftModalOpen(true)}
                className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs shadow-sm"
              >
                + Log Shift / Work Item ⏱️
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsBulkImportModalOpen(true)}
                className="!bg-slate-800 hover:!bg-slate-700 !text-slate-200 !border-slate-700 text-xs"
              >
                📥 Bulk Import (CSV/JSON)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsWebhookInfoModalOpen(true)}
                className="!bg-slate-800 hover:!bg-slate-700 !text-slate-200 !border-slate-700 text-xs"
              >
                🔗 Webhook API
              </Button>
              <Button
                disabled={isGeneratingSubInvoice || (wipSummary?.readyToBillCount ?? 0) === 0}
                onClick={handleGenerateIncrementalInvoice}
                className="!bg-emerald-500 hover:!bg-emerald-400 !text-slate-950 font-black text-xs px-3.5 py-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {isGeneratingSubInvoice
                  ? '⚡ Generating...'
                  : (wipSummary?.readyToBillCount ?? 0) > 0
                  ? `⚡ Generate Invoice (${wipSummary?.readyToBillCount} Ready) 🚀`
                  : '✓ All Approved Records Invoiced'}
              </Button>
            </div>
          </div>

          {/* Real-Time WIP Burndown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-white border border-slate-200 shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Total Work Shifts</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {wipSummary?.totalRecordsCount ?? billableRecords.length}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                <span>Approved: <strong className="text-emerald-600">{wipSummary?.approvedRecordsCount ?? 0}</strong></span>
                <span>Pending: <strong className="text-amber-600">{wipSummary?.pendingRecordsCount ?? 0}</strong></span>
              </div>
            </Card>

            <Card className="p-4 bg-white border border-emerald-200 shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 font-bold block">Ready to Invoice (Delta)</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {wipSummary?.readyToBillCount ?? 0} Records
              </div>
              <span className="text-[10px] text-emerald-700 font-bold">
                ${((wipSummary?.unbilledApprovedBilledRevenueCents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} Billed Revenue
              </span>
            </Card>

            <Card className="p-4 bg-white border border-indigo-200 shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-700 font-bold block">Direct Labor Cost</span>
              <div className="text-2xl font-black text-indigo-600 mt-1">
                ${((wipSummary?.unbilledApprovedRawCostCents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-indigo-700 font-bold">
                Worker Direct Pay / Payroll Base
              </span>
            </Card>

            <Card className="p-4 bg-white border border-purple-200 shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-purple-700 font-bold block">Gross Margin on WIP</span>
              <div className="text-2xl font-black text-purple-600 mt-1">
                {wipSummary?.unbilledProjectedMarginPercent ?? 25.93}%
              </div>
              <span className="text-[10px] text-purple-700 font-bold">
                +{defaultMarkupPercent}% Client Default Markup Applied
              </span>
            </Card>
          </div>

          {/* Itemized Shifts / Billable Work Records Table with Inline Review Actions */}
          <Card>
            <CardHeader className="border-b bg-slate-50/50 pb-3">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    📋 Time & Materials Shift Records (Live Approval & Locking Engine)
                  </CardTitle>
                  <p className="text-xs text-slate-500">
                    Review and approve timesheets right here, or ingest them via Webhooks from external workforce software (Kronos, ADP, Deputy, Clockify).
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={loadWipData} className="text-xs">
                    🔄 Refresh Status
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="p-3">Shift ID</th>
                      <th className="p-3">Specialist & Role</th>
                      <th className="p-3 text-right">Hours</th>
                      <th className="p-3 text-right">Raw Pay</th>
                      <th className="p-3 text-right">Markup (+35%)</th>
                      <th className="p-3 text-right">Billed Rate</th>
                      <th className="p-3 text-right">Billed Total</th>
                      <th className="p-3 text-center">Approval Status</th>
                      <th className="p-3 text-center">Lock Status</th>
                      <th className="p-3 text-right">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billableRecords.map((rec) => (
                      <tr key={rec.id} className={`hover:bg-slate-50 transition ${rec.billingStatus === 'INVOICED' ? 'bg-slate-50/60' : ''}`}>
                        <td className="p-3 font-mono font-bold text-slate-700">{rec.sourceId}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{rec.resourceName}</div>
                          <div className="text-[10px] text-slate-500 font-medium">{rec.resourceRole}</div>
                        </td>
                        <td className="p-3 text-right font-mono">{rec.quantity} hrs</td>
                        <td className="p-3 text-right font-mono text-slate-600">
                          ${(rec.rawCostCents / 100).toFixed(2)}/hr
                        </td>
                        <td className="p-3 text-right font-mono text-indigo-600 font-semibold">
                          +${(rec.markupAmountCents / 100).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          ${(rec.billedUnitPriceCents / 100).toFixed(2)}/hr
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-700">
                          ${(rec.billedTotalAmountCents / 100).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <StatusBadge variant={rec.approvalStatus === 'APPROVED' ? 'success' : rec.approvalStatus === 'REJECTED' ? 'danger' : 'warning'}>
                            {rec.approvalStatus}
                          </StatusBadge>
                        </td>
                        <td className="p-3 text-center">
                          {rec.billingStatus === 'INVOICED' ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 font-bold text-[10px] inline-flex items-center gap-1">
                              🔒 Invoiced ({rec.invoicedInHeaderId?.slice(-6)})
                            </span>
                          ) : rec.approvalStatus === 'APPROVED' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] inline-flex items-center gap-1">
                              ⚡ Ready to Bill
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px]">
                              ⏳ Pending
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap shrink-0">
                            {rec.billingStatus === 'INVOICED' ? (
                              <span className="text-slate-400 font-mono text-[10px] italic">Locked</span>
                            ) : rec.approvalStatus === 'PENDING' ? (
                              <>
                                <button
                                  onClick={() => handleSetApproval(rec.id, 'APPROVED')}
                                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] cursor-pointer shadow-sm whitespace-nowrap"
                                  title="Approve this timesheet shift"
                                >
                                  Approve ✓
                                </button>
                                <button
                                  onClick={() => handleSetApproval(rec.id, 'REJECTED')}
                                  className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] cursor-pointer border border-rose-200 whitespace-nowrap"
                                  title="Reject this timesheet shift"
                                >
                                  Reject ✕
                                </button>
                              </>
                            ) : rec.approvalStatus === 'APPROVED' ? (
                              <button
                                onClick={() => handleSetApproval(rec.id, 'PENDING')}
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] cursor-pointer border border-slate-200 whitespace-nowrap"
                                title="Revert to Pending"
                              >
                                Revoke ↩
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSetApproval(rec.id, 'APPROVED')}
                                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] cursor-pointer border border-emerald-200 whitespace-nowrap"
                                title="Re-approve"
                              >
                                Approve ✓
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: ADD BILLABLE SHIFT / WORK ITEM
          ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isAddShiftModalOpen}
        onClose={() => setIsAddShiftModalOpen(false)}
        size="lg"
        title="⏱️ Log Billable Shift / Milestone Work Item"
        description="Add a specialist work shift or deliverable directly into the project WIP ledger."
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button size="sm" variant="outline" onClick={() => setIsAddShiftModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateShiftSubmit} className="!bg-indigo-600 !text-white font-bold">Log Shift into WIP ✓</Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Specialist / Resource Name *</label>
            <Input
              value={newShiftResourceName}
              onChange={(e) => setNewShiftResourceName(e.target.value)}
              placeholder="e.g. Jordan Miller"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Role / Function</label>
              <select
                value={newShiftRole}
                onChange={(e) => setNewShiftRole(e.target.value)}
                className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-800"
              >
                <option value="Camera Operator">Camera Operator</option>
                <option value="Gaffer / Chief Lighting">Gaffer / Chief Lighting</option>
                <option value="Audio / Sound Engineer">Audio / Sound Engineer</option>
                <option value="Key Grip">Key Grip</option>
                <option value="Production Assistant">Production Assistant</option>
                <option value="Senior Consultant">Senior Consultant</option>
                <option value="Field Service Engineer">Field Service Engineer</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Shift Hours / Quantity</label>
              <Input
                type="number"
                min="1"
                value={newShiftHours}
                onChange={(e) => setNewShiftHours(parseFloat(e.target.value) || 1)}
                className="font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Worker Base Pay Rate ($/hr)</label>
              <Input
                type="number"
                step="0.01"
                value={newShiftPayDollars}
                onChange={(e) => setNewShiftPayDollars(parseFloat(e.target.value) || 0)}
                className="font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Client Markup (%)</label>
              <Input
                type="number"
                value={newShiftMarkupPct}
                onChange={(e) => setNewShiftMarkupPct(parseFloat(e.target.value) || 0)}
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approval Status</label>
            <select
              value={newShiftApprovalStatus}
              onChange={(e) => setNewShiftApprovalStatus(e.target.value as any)}
              className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-800"
            >
              <option value="APPROVED">APPROVED (Immediately Ready to Bill)</option>
              <option value="PENDING">PENDING (Awaiting Client Review)</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: BULK IMPORT TIMESHEETS (CSV / JSON)
          ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        size="xl"
        title="📥 Bulk Ingest Approved Timesheets"
        description="Import batch timesheets from external systems (Kronos, ADP, Deputy, Clockify, Excel)."
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button size="sm" variant="outline" onClick={() => setIsBulkImportModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleBulkImportSubmit} className="!bg-emerald-600 !text-white font-bold">Import Batch into WIP 🚀</Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900">
            <strong>💡 Quick Batch Option:</strong> Leave the text area empty to import a sample batch of 3 pre-approved shift records, or paste your JSON payload below.
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">JSON Timesheet Payload (Optional)</label>
            <textarea
              rows={6}
              value={bulkImportJson}
              onChange={(e) => setBulkImportJson(e.target.value)}
              placeholder='[{"resourceName":"John Doe","resourceRole":"Camera Operator","quantity":8,"rawCostCents":4500,"markupValue":35,"approvalStatus":"APPROVED"}]'
              className="w-full p-3 border border-slate-200 rounded-xl font-mono text-xs text-slate-800"
            />
          </div>
        </div>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: WEBHOOK & API INTEGRATION INFO
          ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isWebhookInfoModalOpen}
        onClose={() => setIsWebhookInfoModalOpen(false)}
        size="xl"
        title="🔗 Timesheet Webhook & API Ingestion"
        description="Automatically ingest approved timesheets from external workforce systems into GigaLibs WIP."
        footer={
          <div className="flex justify-end w-full">
            <Button size="sm" onClick={() => setIsWebhookInfoModalOpen(false)}>Close</Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-slate-800">
          <p>
            When timesheets are approved in your external workforce platform (Kronos, ADP, Clockify, Harvest, Deputy), configure an outbound webhook to call:
          </p>
          <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto space-y-2">
            <div className="text-emerald-400"># Ingest approved timesheet payload</div>
            <div>POST http://your-domain/api/v1/invoices/billable-records/warner-bros</div>
            <div>Content-Type: application/json</div>
            <pre className="text-slate-300">{`{
  "projectOrEventId": "${selectedProjectId}",
  "resourceName": "Specialist Name",
  "resourceRole": "Camera Operator",
  "quantity": 8,
  "rawCostCents": 4500,
  "markupType": "PERCENTAGE",
  "markupValue": 35,
  "approvalStatus": "APPROVED"
}`}</pre>
          </div>
          <p className="text-[11px] text-slate-500">
            Once ingested, the records immediately appear in this WIP Burndown studio and increase the <strong>Ready to Bill</strong> count in real-time.
          </p>
        </div>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 3: COST-PLUS & MARGIN TRANSPARENCY STUDIO
          ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'cost_plus_margins' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-base font-black text-slate-900 mb-2">
                🧮 Interactive Cost-Plus Markup Engine
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Calculate client billing rates from direct labor/asset costs with margin transparency.
              </p>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Base Direct Cost ($/hr)</label>
                  <Input
                    type="number"
                    defaultValue="45.00"
                    onChange={(e) => {}}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Markup Type</label>
                    <select className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-800">
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FLAT_AMOUNT">Flat Surcharge ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Markup Value (%)</label>
                    <Input
                      type="number"
                      value={defaultMarkupPercent}
                      onChange={(e) => setDefaultMarkupPercent(parseFloat(e.target.value) || 0)}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 font-mono text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Direct Worker Pay:</span>
                    <span>$45.00 / hr</span>
                  </div>
                  <div className="flex justify-between text-indigo-700 font-bold">
                    <span>+ Client Markup ({defaultMarkupPercent}%):</span>
                    <span>+${((45 * defaultMarkupPercent) / 100).toFixed(2)} / hr</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-slate-900 border-t border-indigo-200 pt-2">
                    <span>Final Client Billed Rate:</span>
                    <span>${(45 + (45 * defaultMarkupPercent) / 100).toFixed(2)} / hr</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold pt-1">
                    <span>Gross Profit Margin:</span>
                    <span>{(((45 * defaultMarkupPercent) / (100 * (45 + (45 * defaultMarkupPercent) / 100))) * 100).toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-base font-black text-slate-900 mb-2">
                🏛️ Multi-Tier Markup Hierarchy Resolution
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                The engine resolves markup priority following standard enterprise precedence:
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 border rounded-xl">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>1. Line-Item Manual Override</span>
                    <Badge variant="info">Highest Priority</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Specific rate specified directly on an invoice line item during draft review.</p>
                </div>

                <div className="p-3 bg-slate-50 border rounded-xl">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>2. Role / Category Rate Card</span>
                    <Badge variant="neutral">Tier 2</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Custom markup configured for specific roles (e.g. DP = +40%, Grip = +35%).</p>
                </div>

                <div className="p-3 bg-slate-50 border rounded-xl">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>3. Client Commercial Profile Default</span>
                    <Badge variant="neutral">Tier 3</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Client-wide negotiated default margin (e.g. Warner Bros = +35%).</p>
                </div>

                <div className="p-3 bg-slate-50 border rounded-xl">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>4. Global Tenant Baseline</span>
                    <Badge variant="neutral">Default</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Platform baseline markup applied when no client-specific contract exists.</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: VOID INVOICE (MANDATORY REASON & RECORD RELEASE)
          ──────────────────────────────────────────────────────────────────────── */}
      {invoiceToVoid && (
        <Modal
          isOpen={isVoidModalOpen}
          onClose={() => setIsVoidModalOpen(false)}
          size="md"
          title={`🚫 Void Invoice #${invoiceToVoid.invoiceNumber}`}
          description="Voiding cancels this invoice, creates a general ledger reversal, and unlocks all covered billable items for re-invoicing."
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button size="sm" variant="outline" onClick={() => setIsVoidModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleExecuteVoid} className="!bg-rose-600 !text-white font-bold">
                Confirm Void & Release Records 🚫
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
              <strong>⚠️ Audit Compliance Notice:</strong> Invoices are never hard-deleted. An immutable audit record will document this void action and release all associated timesheet/shift records back to the unbilled pool.
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Documented Reason for Void *</label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Correcting crew hours for Camera Operator overtime rate"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 4: CLIENT DIRECTORY (ACCOUNTS MASTER BOOK)
          ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'clients' && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="w-80">
              <Input
                placeholder="🔍 Search clients by name, tax ID, email..."
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={() => setIsAddClientModalOpen(true)} className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs">
              + Add New Client Account 👥
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">Account #</th>
                      <th className="p-3">Legal Business Name & DBA</th>
                      <th className="p-3">AP Billing Contact</th>
                      <th className="p-3">Tax ID / VAT</th>
                      <th className="p-3">Location</th>
                      <th className="p-3">Default Terms</th>
                      <th className="p-3 text-right">Total Invoiced</th>
                      <th className="p-3 text-right">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clients
                      .filter((c) => c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) || c.email.toLowerCase().includes(clientSearchQuery.toLowerCase()))
                      .map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-indigo-600">{c.accountNumber}</td>
                          <td className="p-3">
                            <strong className="text-slate-900 text-sm block">{c.name}</strong>
                            {c.dba && <span className="text-[10px] text-slate-400 block font-mono">DBA: {c.dba}</span>}
                          </td>
                          <td className="p-3 font-mono">
                            <span className="text-slate-700 font-semibold block">{c.email}</span>
                            <span className="text-[10px] text-slate-400">{c.phone || 'No phone'}</span>
                          </td>
                          <td className="p-3 font-mono text-slate-600">
                            {c.taxIdentifier || <span className="text-slate-400">None</span>}
                            {c.isTaxExempt && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold">EXEMPT</span>}
                          </td>
                          <td className="p-3 text-slate-700 font-medium">
                            {c.city ? `${c.city}, ${c.stateOrProvince}, ${c.country}` : `${c.stateOrProvince || ''}, ${c.country}`}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-700">{c.defaultPaymentTerms}</td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">
                            {MultiCurrencyEngine.format(c.totalInvoicedCents, c.defaultCurrency)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-amber-600">
                            {MultiCurrencyEngine.format(c.outstandingBalanceCents, c.defaultCurrency)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 3: PRODUCTS & SERVICES CATALOG
          ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-slate-900">Reusable Billable Rate Cards & SKU Catalog</h3>
              <p className="text-xs text-slate-500">1-click insertion into any invoice without typing rates repeatedly.</p>
            </div>
            <Button size="sm" onClick={() => setIsAddProductModalOpen(true)} className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold text-xs">
              + Add Catalog Item 📦
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {products.map((p) => (
              <Card key={p.id} className="p-4 hover:border-indigo-300 transition">
                <div className="flex justify-between items-start">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">{p.sku}</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px]">{p.category}</span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm mt-2">{p.name}</h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                <div className="border-t border-slate-100 pt-3 mt-3 flex justify-between items-center">
                  <span className="text-[10px] font-mono text-slate-400">Rate Metric: <strong>{p.unitMetric}</strong></span>
                  <div className="text-base font-black text-slate-900 font-mono">
                    ${(p.unitPriceCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 4: TENANT INVOICE BRANDING & NUMBERING SETTINGS
          ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4 border-b">
            <CardTitle className="text-base font-bold text-slate-900">🏢 Organization Identity, PDF Branding & Numbering Rules</CardTitle>
            <p className="text-xs text-slate-500">Configures the visual identity, brand colors, custom invoice prefix, and bank wire remittance for all generated invoices.</p>
          </CardHeader>
          <CardContent className="p-0 pt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-xs font-mono uppercase text-indigo-600 font-bold">1. Legal Company Profile</h4>
                <div>
                  <label className="text-xs font-bold text-slate-700">Legal Business Name</label>
                  <Input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Tax Identification (EIN / VAT / GST)</label>
                  <Input value={settings.companyTaxId} onChange={(e) => setSettings({ ...settings, companyTaxId: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Address Line 1</label>
                  <Input value={settings.companyAddressLine1} onChange={(e) => setSettings({ ...settings, companyAddressLine1: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">City, State & Postal Code</label>
                  <Input value={settings.companyCityStateZip} onChange={(e) => setSettings({ ...settings, companyCityStateZip: e.target.value })} />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-mono uppercase text-indigo-600 font-bold">2. Visual Theming & Numbering Sequencer</h4>
                <div>
                  <label className="text-xs font-bold text-slate-700">Primary Brand Accent Color (HEX)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={settings.brandColorHex}
                      onChange={(e) => setSettings({ ...settings, brandColorHex: e.target.value })}
                      className="w-10 h-9 rounded cursor-pointer border border-slate-300"
                    />
                    <Input value={settings.brandColorHex} onChange={(e) => setSettings({ ...settings, brandColorHex: e.target.value })} className="font-mono text-xs" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Invoice Numbering Prefix</label>
                  <Input value={settings.invoicePrefix} onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })} placeholder="e.g. WBD-2026-, INV-" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Next Counter</label>
                    <Input type="number" value={settings.nextInvoiceNumber} onChange={(e) => setSettings({ ...settings, nextInvoiceNumber: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700">Padding Digits</label>
                    <Input type="number" value={settings.numberPadding} onChange={(e) => setSettings({ ...settings, numberPadding: parseInt(e.target.value) || 4 })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Next Output Preview</label>
                  <div className="p-2.5 bg-slate-900 text-indigo-400 font-mono font-bold rounded-xl text-xs">
                    {NumberingSequencer.formatInvoiceNumber({ prefix: settings.invoicePrefix, nextNumber: settings.nextInvoiceNumber, numberPadding: settings.numberPadding })}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-end">
              <Button size="sm" onClick={() => alert('✓ Tenant branding and invoice settings saved!')} className="!bg-indigo-600 !text-white font-bold text-xs">
                Save Invoice Settings ✓
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: CREATE BRANDED INVOICE
          ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        size="5xl"
        title={`✨ Create Invoice (#${NumberingSequencer.formatInvoiceNumber({ prefix: settings.invoicePrefix, nextNumber: settings.nextInvoiceNumber + invoices.length, numberPadding: settings.numberPadding })})`}
        description="Select client from master directory, add catalog items, and verify 50-state tax nexus."
        footer={
          <div className="flex flex-wrap justify-between items-center w-full gap-3">
            <div className="text-xs font-mono flex items-center gap-2">
              <span className="text-slate-500">Subtotal: <strong className="text-slate-800">{MultiCurrencyEngine.format(modalCalculatedTotals.subtotalCents, invCurrency)}</strong></span>
              <span className="text-slate-300">•</span>
              <span className="text-indigo-600 font-semibold">Tax ({activeTaxConfig.ratePercent}%): <strong>+{MultiCurrencyEngine.format(modalCalculatedTotals.taxAmountCents, invCurrency)}</strong></span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-700">Total Due: <strong className="text-base text-indigo-700 font-black">{MultiCurrencyEngine.format(modalCalculatedTotals.totalAmountCents, invCurrency)}</strong></span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateInvoiceSubmit} className="!bg-indigo-600 !text-white font-bold">Issue Invoice 🚀</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5 text-xs max-h-[70vh] overflow-y-auto pr-1">
          {/* Client Selector & Quick Add */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <label className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Select Client Account (Master Book)</label>
              <button
                type="button"
                onClick={() => setIsAddClientModalOpen(true)}
                className="text-indigo-600 hover:text-indigo-800 font-bold text-xs cursor-pointer"
              >
                + Add New Client On-The-Fly
              </button>
            </div>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email}) • {c.country}-{c.stateOrProvince || ''}
                </option>
              ))}
            </select>
            {activeSelectedClient && (
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                <div>Tax ID: <strong>{activeSelectedClient.taxIdentifier || 'None'}</strong></div>
                <div>Location: <strong>{activeSelectedClient.stateOrProvince}, {activeSelectedClient.country}</strong></div>
                <div>Tax Nexus: <strong className="text-indigo-600">{activeTaxConfig.description} ({activeTaxConfig.ratePercent}%)</strong></div>
              </div>
            )}
          </div>

          {/* Quick Rate Catalog Picker */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">1-Click Insert From Rate Catalog</label>
              <Button size="sm" variant="outline" onClick={handleAddBlankLineItem} className="text-xs">+ Blank Custom Item</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAddLineItemFromCatalog(p.id)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-400 text-slate-700 text-xs font-medium cursor-pointer transition flex items-center gap-1.5"
                >
                  <span>+ {p.name}</span>
                  <span className="font-mono text-indigo-600 font-bold">${(p.unitPriceCents / 100).toFixed(0)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Line Items Table with Dynamic Line-Item Tax & Subtotal */}
          <div className="space-y-2">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-600 font-bold border-b">
                <tr>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 w-16 text-right">Qty</th>
                  <th className="p-2 w-28 text-right">Unit Price ($)</th>
                  <th className="p-2 w-24 text-right">Net Subtotal</th>
                  <th className="p-2 w-28 text-right">Tax ({activeTaxConfig.ratePercent}%)</th>
                  <th className="p-2 w-28 text-right">Total with Tax</th>
                  <th className="p-2 w-8 text-center">✕</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invLineItems.map((item, idx) => {
                  const netAmountCents = item.quantity * item.unitPriceCents;
                  const taxRate = item.taxRatePercent ?? activeTaxConfig.ratePercent;
                  const taxAmountCents = Math.round((netAmountCents * taxRate) / 100);
                  const lineTotalCents = netAmountCents + taxAmountCents;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-2">
                        <Input
                          value={item.description}
                          onChange={(e) => handleUpdateLineItem(idx, { description: e.target.value })}
                          placeholder="Item description or billable service"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleUpdateLineItem(idx, { quantity: parseFloat(e.target.value) || 1 })}
                          className="text-right font-mono"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          value={(item.unitPriceCents / 100).toFixed(2)}
                          onChange={(e) => handleUpdateLineItem(idx, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                          className="text-right font-mono"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-semibold text-slate-700">
                        ${(netAmountCents / 100).toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        <span className="text-indigo-600 font-semibold">+{taxRate}%</span>
                        <span className="text-slate-400 block text-[10px]">(${ (taxAmountCents / 100).toFixed(2) })</span>
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        ${(lineTotalCents / 100).toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(idx)}
                          className="text-rose-500 font-bold cursor-pointer hover:text-rose-700"
                          title="Remove line"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Real-Time Tax & Financial Breakdown Summary Card */}
          <div className="flex flex-wrap justify-between items-start gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="space-y-1 text-xs text-slate-600 max-w-sm">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block">
                🏛️ Automated Tax Nexus Engine
              </span>
              <p className="text-[11px] leading-relaxed">
                Sales tax is dynamically applied per client nexus (<strong>{activeTaxConfig.description}</strong>). 
                As you increment unit prices or quantities, subtotal, tax amounts, and total due recalculate in real-time.
              </p>
            </div>

            <div className="w-80 space-y-2 font-mono text-xs bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Net):</span>
                <span className="font-bold text-slate-900">
                  {MultiCurrencyEngine.format(modalCalculatedTotals.subtotalCents, invCurrency)}
                </span>
              </div>

              {modalCalculatedTotals.discountAmountCents > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Global Discount ({invDiscountPercent}%):</span>
                  <span>-{MultiCurrencyEngine.format(modalCalculatedTotals.discountAmountCents, invCurrency)}</span>
                </div>
              )}

              <div className="flex justify-between text-indigo-600 font-semibold border-t border-dashed border-slate-200 pt-2">
                <span>Tax Nexus ({activeTaxConfig.ratePercent}% {activeTaxConfig.description}):</span>
                <span>+{MultiCurrencyEngine.format(modalCalculatedTotals.taxAmountCents, invCurrency)}</span>
              </div>

              <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-2">
                <span>Total Due:</span>
                <span className="text-indigo-600 font-sans font-black">
                  {MultiCurrencyEngine.format(modalCalculatedTotals.totalAmountCents, invCurrency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: ADD NEW CLIENT
          ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        size="2xl"
        title="👥 Add Client to Master Directory"
        description="Save client legal entity details, billing address, and default payment terms."
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button size="sm" variant="outline" onClick={() => setIsAddClientModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddClientSubmit} className="!bg-indigo-600 !text-white font-bold">Save Client Account ✓</Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700">Legal Business Name *</label>
            <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="e.g. Paramount Pictures Corp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700">AP Billing Email *</label>
              <Input type="email" value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)} placeholder="ap-finance@paramount.com" />
            </div>
            <div>
              <label className="font-bold text-slate-700">Tax ID (EIN / VAT)</label>
              <Input value={newClientTaxId} onChange={(e) => setNewClientTaxId(e.target.value)} placeholder="US-EIN-95-1298412" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700">Country</label>
              <Input value={newClientCountry} onChange={(e) => setNewClientCountry(e.target.value)} placeholder="US" />
            </div>
            <div>
              <label className="font-bold text-slate-700">State / Region</label>
              <Input value={newClientState} onChange={(e) => setNewClientState(e.target.value)} placeholder="CA" />
            </div>
            <div>
              <label className="font-bold text-slate-700">City</label>
              <Input value={newClientCity} onChange={(e) => setNewClientCity(e.target.value)} placeholder="Los Angeles" />
            </div>
          </div>
          <div>
            <label className="font-bold text-slate-700">Billing Street Address</label>
            <Input value={newClientAddress} onChange={(e) => setNewClientAddress(e.target.value)} placeholder="5555 Melrose Ave" />
          </div>
        </div>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: ADD NEW PRODUCT
          ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isAddProductModalOpen}
        onClose={() => setIsAddProductModalOpen(false)}
        size="lg"
        title="📦 Add Rate Card / SKU to Catalog"
        description="Configure standard reusable rates, metrics, and categories."
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button size="sm" variant="outline" onClick={() => setIsAddProductModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddProductSubmit} className="!bg-indigo-600 !text-white font-bold">Save to Catalog ✓</Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700">Product / Service Name *</label>
            <Input value={newProdName} onChange={(e) => setNewProdName(e.target.value)} placeholder="e.g. Senior Solution Architect" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700">SKU Code *</label>
              <Input value={newProdSku} onChange={(e) => setNewProdSku(e.target.value)} placeholder="SRV-ARCH-01" />
            </div>
            <div>
              <label className="font-bold text-slate-700">Category</label>
              <select
                value={newProdCategory}
                onChange={(e) => setNewProdCategory(e.target.value)}
                className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800"
              >
                <option value="Crew / Labor">Crew / Labor</option>
                <option value="Equipment / Cameras">Equipment / Cameras</option>
                <option value="Cloud / Infrastructure">Cloud / Infrastructure</option>
                <option value="Software License">Software License</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700">Rate ($ Amount) *</label>
              <Input type="number" value={newProdPriceDollars} onChange={(e) => setNewProdPriceDollars(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="font-bold text-slate-700">Unit Metric</label>
              <Input value={newProdMetric} onChange={(e) => setNewProdMetric(e.target.value)} placeholder="Days, Hours, Seats" />
            </div>
          </div>
        </div>
      </Modal>

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: INVOICE PREVIEW
          ──────────────────────────────────────────────────────────────────────── */}
      {selectedInvoice && (
        <Modal
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          size="5xl"
          title={`📄 Invoice Preview: #${selectedInvoice.invoiceNumber}`}
          description={`Client: ${selectedInvoice.customer.name} • Status: ${selectedInvoice.status}`}
          footer={
            <div className="flex justify-between items-center w-full">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => triggerPdfDownload(selectedInvoice)} className="!bg-indigo-600 !text-white font-bold text-xs shadow-sm">
                  Download Official Branded PDF 📥
                </Button>
              </div>
              {selectedInvoice.status !== 'PAID' && (
                <Button size="sm" onClick={() => handleMarkPaid(selectedInvoice)} className="!bg-emerald-600 hover:!bg-emerald-500 !text-white text-xs">
                  Mark Paid ✓
                </Button>
              )}
            </div>
          }
        >
          <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-6 text-xs text-slate-800 font-sans max-h-[70vh] overflow-y-auto">
            {/* Header with Tenant Branding */}
            <div className="flex justify-between items-start border-b pb-4">
              <div>
                <div className="text-xl font-black text-indigo-600" style={{ color: settings.brandColorHex }}>{settings.companyName}</div>
                <div className="text-slate-500 text-[11px]">{settings.companyAddressLine1}</div>
                <div className="text-slate-500 text-[11px]">{settings.companyCityStateZip}</div>
                <div className="text-slate-500 text-[11px]">Tax ID: {settings.companyTaxId}</div>
              </div>
              <div className="text-right">
                <StatusBadge variant={selectedInvoice.status === 'PAID' ? 'success' : 'info'}>{selectedInvoice.status}</StatusBadge>
                <h2 className="text-lg font-mono font-bold mt-1">#{selectedInvoice.invoiceNumber}</h2>
                <p className="text-[11px] text-slate-500">Issued: {selectedInvoice.issueDate}</p>
              </div>
            </div>

            {/* Billed To */}
            <div className="flex justify-between">
              <div>
                <strong className="text-slate-400 font-mono text-[10px] uppercase block">Billed To:</strong>
                <h4 className="text-sm font-bold text-slate-900 mt-1">{selectedInvoice.customer.name}</h4>
                <p className="text-slate-600">{selectedInvoice.customer.email}</p>
                <p className="text-slate-600">{selectedInvoice.customer.stateOrProvince}, {selectedInvoice.customer.country}</p>
              </div>
              <div className="text-right font-mono">
                <p>Terms: <strong>{selectedInvoice.paymentTerms}</strong></p>
                <p>Due Date: <strong>{selectedInvoice.dueDate}</strong></p>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                <tr>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit Price</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedInvoice.lineItems.map((li, idx) => (
                  <tr key={idx}>
                    <td className="p-2 font-medium">{li.description}</td>
                    <td className="p-2 text-right font-mono">{li.quantity}</td>
                    <td className="p-2 text-right font-mono">{MultiCurrencyEngine.format(li.unitPriceCents, selectedInvoice.currency)}</td>
                    <td className="p-2 text-right font-mono font-bold">{MultiCurrencyEngine.format(li.amountCents, selectedInvoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary */}
            <div className="flex justify-end border-t pt-4">
              <div className="w-64 space-y-1 font-mono text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>{MultiCurrencyEngine.format(selectedInvoice.subtotalCents, selectedInvoice.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax ({selectedInvoice.taxJurisdiction}):</span>
                  <span>+{MultiCurrencyEngine.format(selectedInvoice.taxAmountCents, selectedInvoice.currency)}</span>
                </div>
                <div className="flex justify-between text-base font-black text-slate-900 border-t pt-2" style={{ color: settings.brandColorHex }}>
                  <span>Total Due:</span>
                  <span>{MultiCurrencyEngine.format(selectedInvoice.totalAmountCents, selectedInvoice.currency)}</span>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
