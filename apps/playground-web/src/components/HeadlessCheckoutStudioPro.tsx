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
  HeadlessCart,
  type CartItem,
  type CartDiscount,
  type CartSummary,
  type SavedPaymentMethod,
  type AutoPayConfig,
  type ProductCatalogItem,
  type PaymentReceipt,
  type PaymentFailureDetail,
  type Challenge3dsPayload,
} from '@gigalibs/cart-core';
import { ApiClient } from '../api-client.js';

// ─── MASTER PRODUCT CATALOG ───────────────────────────────────────────────────

export const MASTER_PRODUCT_CATALOG: ProductCatalogItem[] = [
  {
    id: 'prod_arri_35',
    name: 'ARRI Alexa 35 4K Cinema Camera Package',
    category: 'OPTICAL_HARDWARE',
    priceCents: 1920000, // $19,200.00
    icon: '🎬',
    description: 'Super 35 4.6K sensor, 17 stops dynamic range, ARRI RAW licensing included.',
  },
  {
    id: 'prod_skypanel_s60',
    name: 'ARRI SkyPanel S60-C LED Studio Lighting Rig',
    category: 'LIGHTING_GRIP',
    priceCents: 450000, // $4,500.00
    icon: '💡',
    description: 'Fully tuneable soft light, 2,800 K - 10,000 K CCT, DMX / Art-Net remote control.',
  },
  {
    id: 'prod_cloud_seat',
    name: 'GigaLibs Enterprise Cloud Compute Seat',
    category: 'SOFTWARE_SaaS',
    priceCents: 25000, // $250.00
    icon: '☁️',
    description: 'Unlimited AI OCR, Universal Rule Engine, Multi-Tenant Database Isolation & Workflows.',
  },
  {
    id: 'prod_crane_gantry',
    name: 'Technocrane 30ft Telescopic Soundstage Rig',
    category: 'HEAVY_RIGGING',
    priceCents: 1200000, // $12,000.00
    icon: '🏗️',
    description: 'Gyro-stabilized flight head with automated telemetry and OSHA wind interlock.',
  },
];

// ─── INITIAL SAVED PAYMENT METHODS VAULT ───────────────────────────────────────

export const INITIAL_SAVED_PAYMENTS: SavedPaymentMethod[] = [
  {
    id: 'pm_card_01',
    type: 'CARD',
    brand: 'Visa',
    last4: '4242',
    holderName: 'Sarah Connor (Paramount Finance)',
    expMonth: 12,
    expYear: 2028,
    isDefault: true,
  },
  {
    id: 'pm_card_02',
    type: 'CARD',
    brand: 'Mastercard Corporate',
    last4: '8812',
    holderName: 'Paramount Global Corp Treasury',
    expMonth: 8,
    expYear: 2029,
    isDefault: false,
  },
  {
    id: 'pm_ach_03',
    type: 'ACH',
    brand: 'ACH Direct Debit',
    last4: '9012',
    holderName: 'Paramount Operating Account',
    bankName: 'JPMorgan Chase Bank, N.A.',
    isDefault: false,
  },
];

// ─── TAX JURISDICTIONS ────────────────────────────────────────────────────────

export const TAX_REGIONS = [
  { code: 'CA', name: 'California (CA Sales Tax)', ratePercent: 9.5 },
  { code: 'NY', name: 'New York (NY State & City Tax)', ratePercent: 8.875 },
  { code: 'TX', name: 'Texas (TX Sales Tax)', ratePercent: 8.25 },
  { code: 'FL', name: 'Florida (FL Sales Tax)', ratePercent: 7.0 },
  { code: 'EU_VAT', name: 'European Union (Standard VAT)', ratePercent: 20.0 },
  { code: 'DE_EXEMPT', name: 'Delaware / Corporate Tax-Exempt', ratePercent: 0.0 },
];

export function HeadlessCheckoutStudioPro() {
  const [activeStudioTab, setActiveStudioTab] = React.useState<'CART' | 'RECEIPT' | 'FAILURES' | 'DUNNING' | 'SAVED_VAULT'>('CART');

  // Live catalog from DB
  const [liveCatalog, setLiveCatalog] = React.useState<ProductCatalogItem[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = React.useState(true);

  React.useEffect(() => {
    setIsCatalogLoading(true);
    ApiClient.listProducts()
      .then((items) => {
        const mapped: ProductCatalogItem[] = items.map((p: any) => ({
          id: p.id,
          name: p.name,
          category: p.category ?? 'PRODUCT',
          priceCents: p.priceCents ?? Math.round((p.price ?? 0) * 100),
          icon: p.icon ?? '📦',
          description: p.description ?? '',
        }));
        setLiveCatalog(mapped);
      })
      .catch(() => setLiveCatalog(MASTER_PRODUCT_CATALOG))
      .finally(() => setIsCatalogLoading(false));
  }, []);

  // Cart State — starts empty, populated from live catalog
  const [cartItems, setCartItems] = React.useState<CartItem[]>([]);

  // Tax & Discount State
  const [selectedTaxRegion, setSelectedTaxRegion] = React.useState('CA');
  const [couponCodeInput, setCouponCodeInput] = React.useState('');
  const [appliedDiscount, setAppliedDiscount] = React.useState<CartDiscount | undefined>({
    code: 'SUMMER2026',
    type: 'percentage',
    value: 10, // 10% off
  });

  // Saved Payments Vault State
  const [savedPayments, setSavedPayments] = React.useState<SavedPaymentMethod[]>(INITIAL_SAVED_PAYMENTS);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = React.useState<string>(INITIAL_SAVED_PAYMENTS[0]!.id);
  const [isAddCardModalOpen, setIsAddCardModalOpen] = React.useState(false);
  const [newCardNumber, setNewCardNumber] = React.useState('4000123456789010');
  const [newCardExp, setNewCardExp] = React.useState('10/29');
  const [newCardHolder, setNewCardHolder] = React.useState('Paramount Production Exec');

  // Auto-Pay State
  const [autoPayConfig, setAutoPayConfig] = React.useState<AutoPayConfig>({
    isEnabled: true,
    defaultPaymentMethodId: 'pm_card_01',
    retryPolicy: 'Smart Dunning (Retry on Day 1, 3, 7)',
    notifyDaysBefore: 3,
  });

  // Recent Added Item ID for Glow Animation
  const [recentlyAddedId, setRecentlyAddedId] = React.useState<string | null>(null);

  // Active Receipt State
  const [activeReceipt, setActiveReceipt] = React.useState<PaymentReceipt | null>(null);

  // Active Failure State
  const [activeFailure, setActiveFailure] = React.useState<PaymentFailureDetail | null>(null);

  // 3DS2 Challenge Modal State
  const [is3dsModalOpen, setIs3dsModalOpen] = React.useState(false);
  const [challenge3dsData, setChallenge3dsData] = React.useState<Challenge3dsPayload | null>(null);
  const [inputOtpCode, setInputOtpCode] = React.useState('');

  // Active Tax Rate
  const activeTaxRate = TAX_REGIONS.find((r) => r.code === selectedTaxRegion)?.ratePercent || 0;

  // Cart Calculation
  const cartSummary: CartSummary = React.useMemo(() => {
    const cart = new HeadlessCart();
    cartItems.forEach((i) => cart.addItem(i));
    cart.applyDiscount(appliedDiscount);
    cart.setTaxRate(activeTaxRate);
    return cart.calculate();
  }, [cartItems, appliedDiscount, activeTaxRate]);

  // Initial receipt generator if none
  React.useEffect(() => {
    if (!activeReceipt && cartItems.length > 0) {
      const initReceipt = HeadlessCart.createPaymentReceipt(
        'ORD-2026-889120',
        'Sarah Connor (Paramount Global Corp)',
        'sarah@paramount.com',
        'Visa •••• 4242',
        cartSummary,
        TAX_REGIONS.find((r) => r.code === selectedTaxRegion)?.name || 'California',
        cartItems
      );
      setActiveReceipt(initReceipt);
    }
  }, []);

  // Add Item to Cart (Prepends to Top)
  const handleAddToCart = (product: ProductCatalogItem) => {
    const existingIndex = cartItems.findIndex((i) => i.productId === product.id);
    let newId = '';

    if (existingIndex > -1) {
      newId = cartItems[existingIndex]!.id;
      setCartItems((prev) =>
        prev.map((i) => (i.id === newId ? { ...i, quantity: i.quantity + 1 } : i))
      );
    } else {
      newId = `item_${Date.now()}`;
      const newItem: CartItem = {
        id: newId,
        productId: product.id,
        name: product.name,
        unitPrice: product.priceCents,
        quantity: 1,
        icon: product.icon,
      };
      setCartItems((prev) => [newItem, ...prev]); // Prepend to top!
    }

    setRecentlyAddedId(newId);
    setTimeout(() => setRecentlyAddedId(null), 2500);
  };

  // Quantity Steppers
  const handleUpdateQty = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Remove Item
  const handleRemoveItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Apply Coupon
  const handleApplyCoupon = () => {
    const code = couponCodeInput.trim().toUpperCase();
    if (code === 'SUMMER2026' || code === 'SAVE10') {
      setAppliedDiscount({ code, type: 'percentage', value: 10 });
      alert('10% Summer Discount Applied!');
    } else if (code === 'VIP500' || code === 'PROMO500') {
      setAppliedDiscount({ code, type: 'fixed', value: 50000 }); // $500.00
      alert('$500.00 VIP Credit Applied!');
    } else {
      alert('Invalid coupon code. Try SUMMER2026 or VIP500.');
    }
  };

  // Save New Card
  const handleSaveCard = () => {
    const last4 = newCardNumber.slice(-4) || '1234';
    const newPm: SavedPaymentMethod = {
      id: `pm_card_${Date.now()}`,
      type: 'CARD',
      brand: 'Visa Business',
      last4,
      holderName: newCardHolder,
      expMonth: 10,
      expYear: 2029,
      isDefault: false,
    };
    setSavedPayments((prev) => [...prev, newPm]);
    setIsAddCardModalOpen(false);
    alert(`Card ending in •••• ${last4} tokenized and saved to vault!`);
  };

  // Set Default Payment Method
  const handleSetDefaultPayment = (id: string) => {
    setSavedPayments((prev) =>
      prev.map((pm) => ({ ...pm, isDefault: pm.id === id }))
    );
    setSelectedPaymentMethodId(id);
  };

  // Execute Successful Checkout & Persist to DB
  const handleExecuteSuccessCheckout = async () => {
    const orderNum = `ORD-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const receipt = HeadlessCart.createPaymentReceipt(
      orderNum,
      'Sarah Connor (Paramount Global Corp)',
      'sarah@paramount.com',
      savedPayments.find((p) => p.id === selectedPaymentMethodId)?.brand || 'Visa •••• 4242',
      cartSummary,
      TAX_REGIONS.find((r) => r.code === selectedTaxRegion)?.name || 'California',
      cartItems
    );
    setActiveReceipt(receipt);
    setActiveFailure(null);
    setActiveStudioTab('RECEIPT');

    // Persist to PostgreSQL database
    try {
      await ApiClient.checkoutOrder({
        customerEmail: 'sarah@paramount.com',
        currency: 'USD',
        totalCents: cartSummary.totalCents,
        items: cartItems.map((item) => ({
          sku: item.productId,
          name: item.name,
          unitPriceCents: item.unitPrice,
          quantity: item.quantity,
        })),
      });
    } catch {}
  };

  // Simulate Payment Failure Scenarios
  const handleSimulateFailure = (scenario: 'INSUFFICIENT_FUNDS' | 'EXPIRED_CARD' | '3DS_CHALLENGE' | 'FRAUD_BLOCK' | 'ACH_RETURN') => {
    switch (scenario) {
      case 'INSUFFICIENT_FUNDS':
        setActiveFailure({
          failureCode: 'card_declined_insufficient_funds',
          failureReason: 'The card issuer declined the charge due to insufficient available balance or credit line limit.',
          declineType: 'SOFT_DECLINE',
          automatedRecoveryAction: 'Initiated Smart Dunning Retry Schedule (Retries on Day 1, Day 3, and Day 7). Email & SMS alerts dispatched.',
          dunningSchedule: [
            { day: 1, action: 'Automated Card Re-Attempt #1 + Customer Email Notice', status: 'SCHEDULED' },
            { day: 3, action: 'Automated Card Re-Attempt #2 + SMS Urgent Alert', status: 'SCHEDULED' },
            { day: 7, action: 'Final Automated Re-Attempt #3 before Account Quarantine', status: 'SCHEDULED' },
          ],
        });
        setActiveStudioTab('FAILURES');
        break;

      case 'EXPIRED_CARD':
        setActiveFailure({
          failureCode: 'expired_card_error',
          failureReason: 'Primary card expiration date (10/24) has passed.',
          declineType: 'HARD_DECLINE',
          automatedRecoveryAction: 'Auto-switched billing to secondary saved payment method: Mastercard Corporate •••• 8812.',
          suggestedAlternativePaymentMethod: 'Mastercard Corporate •••• 8812',
          dunningSchedule: [
            { day: 0, action: 'Fallback charge executed on secondary card Mastercard •••• 8812', status: 'EXECUTED' },
          ],
        });
        setActiveStudioTab('FAILURES');
        break;

      case '3DS_CHALLENGE':
        setChallenge3dsData({
          challengeUrl: 'https://bank-auth.chase.com/3ds2/challenge/auth',
          transactionId: `3ds_tx_${Date.now()}`,
          bankName: 'JPMorgan Chase Bank 3D-Secure 2.0',
          otpHint: '849-201',
          amountDue: cartSummary.grandTotal / 100,
        });
        setIs3dsModalOpen(true);
        break;

      case 'FRAUD_BLOCK':
        setActiveFailure({
          failureCode: 'suspected_fraud_velocity_block',
          failureReason: 'Module 5 Fraud Engine flagged transaction (Risk Score: 92/100) due to Impossible Geovelocity and Disposable Email.',
          declineType: 'FRAUD_BLOCK',
          automatedRecoveryAction: 'Transaction quarantined in Dead-Letter Queue. Tenant account placed on high-priority security review.',
          dunningSchedule: [],
        });
        setActiveStudioTab('FAILURES');
        break;

      case 'ACH_RETURN':
        setActiveFailure({
          failureCode: 'ach_insufficient_funds_r01',
          failureReason: 'Direct Debit returned with Federal Reserve ACH Return Code R01 (Insufficient Funds).',
          declineType: 'SOFT_DECLINE',
          automatedRecoveryAction: 'Dispatched electronic invoice payment link + switched default to Visa •••• 4242.',
          suggestedAlternativePaymentMethod: 'Visa •••• 4242',
          dunningSchedule: [
            { day: 1, action: 'Re-presentment via NACHA ACH retry protocol', status: 'SCHEDULED' },
          ],
        });
        setActiveStudioTab('FAILURES');
        break;
    }
  };

  // Complete 3DS Verification
  const handleVerify3dsOtp = () => {
    setIs3dsModalOpen(false);
    alert('✓ 3D-Secure 2.0 Strong Customer Authentication Verified by Bank!');
    handleExecuteSuccessCheckout();
  };

  // Download PDF Action
  const handleDownloadPdf = () => {
    if (!activeReceipt) return;
    const printWindow = window.open('', '_blank', 'width=850,height=800');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to download the official receipt.');
      return;
    }

    const itemsHtml = activeReceipt.items
      .map(
        (i) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 8px;"><strong>${i.description}</strong></td>
        <td style="padding: 10px 8px; text-align: right; font-family: monospace;">${i.quantity}</td>
        <td style="padding: 10px 8px; text-align: right; font-family: monospace;">$${(i.unitPriceCents / 100).toFixed(2)}</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: bold; font-family: monospace;">$${(i.amountCents / 100).toFixed(2)}</td>
      </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Official Payment Receipt #${activeReceipt.receiptNumber}</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 28px; color: #0f172a; margin: 0; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 14px; display: flex; justify-content: space-between; }
            .badge { background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 8px; font-weight: bold; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; }
            .totals { width: 280px; margin-top: 20px; margin-left: auto; font-size: 12px; }
            .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 18px; display: flex; justify-content: space-between; background: #f1f5f9; padding: 10px 14px; border-radius: 8px;">
            <span>📄 Official Payment Receipt Document</span>
            <button onclick="window.print()" style="background: #4f46e5; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer;">
              🖨️ Print / Save as PDF
            </button>
          </div>
          <div class="header">
            <div>
              <h2 style="margin: 0; color: #4f46e5;">GigaLibs Cloud Payments</h2>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">San Francisco, CA • US-EIN-94-1298412</p>
            </div>
            <div style="text-align: right;">
              <span class="badge">✓ PAID (SETTLED)</span>
              <h3 style="margin: 6px 0 0 0; font-family: monospace;">#${activeReceipt.receiptNumber}</h3>
              <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">${activeReceipt.paidAt}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Description</th><th style="text-align: right;">Qty</th><th style="text-align: right;">Unit Price</th><th style="text-align: right;">Amount</th></tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="totals">
            <div><span>Subtotal:</span><span style="font-family: monospace;">$${(activeReceipt.subtotalCents / 100).toFixed(2)}</span></div>
            <div><span>Tax (${activeReceipt.taxJurisdiction}):</span><span style="font-family: monospace;">+$${(activeReceipt.taxCents / 100).toFixed(2)}</span></div>
            <div style="border-top: 2px solid #0f172a; font-weight: bold; font-size: 14px; margin-top: 6px; padding-top: 6px;">
              <span>Total Paid:</span><span style="color: #4f46e5; font-family: monospace;">$${(activeReceipt.totalCents / 100).toFixed(2)}</span>
            </div>
          </div>
          <div style="margin-top: 36px; border-top: 1px dashed #cbd5e1; padding-top: 12px; font-size: 10px; color: #64748b;">
            Card: <strong>${activeReceipt.cardBrand} •••• ${activeReceipt.cardLast4}</strong> • Network Auth: <code>${activeReceipt.networkAuthCode}</code> • Cryptographic SHA-256 Digest: <code>${activeReceipt.receiptNumber}</code>
          </div>
        </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>🛒 Headless Cart, PDF Tax Receipts & Smart Dunning Studio</span>
            <Badge variant="info">Stripe & Chargebee Grade</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            Top-placement cart line items, <strong>official downloadable PDF tax receipts</strong>, 5 payment decline recovery handlers, 3DS2 bank OTP modals, and <strong>smart dunning retries</strong>.
          </p>
        </div>

        {/* Master Tab Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border">
          {[
            { id: 'CART', label: `🛒 Shopping Cart (${cartItems.length})` },
            { id: 'RECEIPT', label: '🧾 Official Tax Receipt' },
            { id: 'FAILURES', label: '🚨 Failure Scenarios' },
            { id: 'DUNNING', label: '🔄 Smart Dunning Schedule' },
            { id: 'SAVED_VAULT', label: `💳 Saved Vault (${savedPayments.length})` },
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

      {/* Action Banner */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold text-indigo-300">Live Order Total:</span>
          <span className="text-2xl font-black text-emerald-400 font-mono">
            ${(cartSummary.grandTotal / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </span>
          <span className="text-slate-400 text-xs">
            ({cartItems.reduce((acc, i) => acc + i.quantity, 0)} units • Tax: {activeTaxRate}%)
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleExecuteSuccessCheckout}
            className="!bg-emerald-600 hover:!bg-emerald-500 !text-white font-bold"
          >
            Complete Order & View PDF Receipt 🧾
          </Button>
        </div>
      </div>

      {/* ─── TAB 1: SHOPPING CART & CATALOG ────────────────────────────────────── */}
      {activeStudioTab === 'CART' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Catalog */}
          <div className="lg:col-span-6 space-y-4">
            <Card className="p-6 space-y-4">
              <div className="border-b pb-2 flex justify-between items-center">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  📦 Master Equipment & Software Catalog
                </h4>
                <Badge variant="info">Instant Add</Badge>
              </div>

              <div className="space-y-3 text-xs">
                {MASTER_PRODUCT_CATALOG.map((prod) => (
                  <div
                    key={prod.id}
                    className="p-4 bg-slate-50 rounded-2xl border flex flex-wrap justify-between items-center gap-3 hover:border-indigo-300 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl border flex items-center justify-center text-xl shadow-xs">
                        {prod.icon}
                      </div>
                      <div className="max-w-xs">
                        <strong className="text-slate-900 text-xs block">{prod.name}</strong>
                        <p className="text-[11px] text-slate-500 leading-tight">{prod.description}</p>
                        <div className="font-mono font-black text-indigo-600 text-xs mt-1">
                          ${(prod.priceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    <Button size="sm" onClick={() => handleAddToCart(prod)} className="font-bold">
                      + Add to Cart
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Active Cart Items & Taxes */}
          <div className="lg:col-span-6 space-y-4">
            <Card className="p-6 space-y-5">
              <div className="border-b pb-2 flex justify-between items-center">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  🛒 Active Cart ({cartItems.length} Line Items)
                </h4>
                {appliedDiscount && (
                  <Badge variant="success">Coupon: {appliedDiscount.code} (-10%)</Badge>
                )}
              </div>

              {/* Line Items List */}
              <div className="space-y-2.5 text-xs max-h-[320px] overflow-y-auto pr-1">
                {cartItems.map((item) => {
                  const isRecentlyAdded = item.id === recentlyAddedId;
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-2xl border flex justify-between items-center gap-3 transition-all duration-500 ${
                        isRecentlyAdded
                          ? 'bg-amber-50 border-amber-400 ring-4 ring-amber-400/20 shadow-md'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{item.icon || '📦'}</span>
                        <div>
                          <strong className="text-slate-900 text-xs block">{item.name}</strong>
                          <div className="font-mono text-[11px] text-slate-500">
                            ${(item.unitPrice / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} each
                          </div>
                        </div>
                      </div>

                      {/* Quantity Stepper & Subtotal */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center border rounded-xl bg-slate-50 p-1">
                          <button
                            onClick={() => handleUpdateQty(item.id, -1)}
                            className="w-6 h-6 rounded-lg bg-white border flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100"
                          >
                            -
                          </button>
                          <span className="px-2.5 font-mono font-bold text-xs">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateQty(item.id, 1)}
                            className="w-6 h-6 rounded-lg bg-white border flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100"
                          >
                            +
                          </button>
                        </div>

                        <div className="font-mono font-bold text-slate-900 text-xs min-w-[70px] text-right">
                          ${((item.unitPrice * item.quantity) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>

                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-400 hover:text-rose-600 text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tax & Discount Form */}
              <div className="p-4 bg-slate-50 rounded-2xl border space-y-3 text-xs">
                <div>
                  <label className="font-bold block mb-1">Billing State / Tax Jurisdiction</label>
                  <select
                    value={selectedTaxRegion}
                    onChange={(e) => setSelectedTaxRegion(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
                  >
                    {TAX_REGIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name} ({r.ratePercent}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Enter coupon (e.g. SUMMER2026, VIP500)"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value)}
                  />
                  <Button size="sm" variant="outline" onClick={handleApplyCoupon}>
                    Apply
                  </Button>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="space-y-2 border-t pt-3 text-xs font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>${(cartSummary.subtotal / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                {cartSummary.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Discount Applied:</span>
                    <span>-${(cartSummary.discountTotal / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Estimated Tax ({activeTaxRate}%):</span>
                  <span>+${(cartSummary.taxTotal / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-base font-black text-slate-900 border-t pt-2 font-sans">
                  <span>Grand Total:</span>
                  <span className="font-mono text-indigo-600">
                    ${(cartSummary.grandTotal / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 2: OFFICIAL PDF TAX RECEIPT & BREAKDOWN ────────────────────────── */}
      {activeStudioTab === 'RECEIPT' && activeReceipt && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Printable Official Receipt Card */}
          <Card className="p-8 space-y-6 border-2 border-slate-300 shadow-xl bg-white text-slate-900">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏢</span>
                  <h3 className="text-xl font-black text-slate-900">PARAMOUNT GLOBAL STUDIOS</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">5555 Melrose Ave, Hollywood, CA 90038 • Tax ID: 95-1284920</p>
                <div className="text-xs font-mono text-indigo-600 font-bold mt-1">
                  OFFICIAL TAX RECEIPT & SETTLEMENT CONFIRMATION
                </div>
              </div>

              <div className="text-right font-mono text-xs space-y-1">
                <div>Receipt: <strong>{activeReceipt.receiptNumber}</strong></div>
                <div>Order ID: <strong>{activeReceipt.orderId}</strong></div>
                <div className="text-slate-500">Date: {activeReceipt.paidAt.split('T')[0]}</div>
                <Badge variant="success">PAID & SETTLED</Badge>
              </div>
            </div>

            {/* Bill To & Payment Method */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-slate-50 p-4 rounded-xl border">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Billed To:</span>
                <strong className="text-slate-900 text-sm font-sans block">{activeReceipt.customerName}</strong>
                <span className="text-slate-600">{activeReceipt.customerEmail}</span>
                <div className="text-slate-500 mt-0.5">Jurisdiction: {activeReceipt.taxJurisdiction}</div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Payment Details:</span>
                <strong className="text-slate-900 block font-sans">{activeReceipt.paymentMethodUsed}</strong>
                <span className="text-emerald-600 font-bold">Transaction Status: CLEARED</span>
                <div className="text-[10px] text-slate-400 mt-0.5">Auth Code: AUTH_99218204</div>
              </div>
            </div>

            {/* Itemized Table */}
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead className="bg-slate-100 border-y border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Unit Price</th>
                  <th className="p-3 text-right">Amount ($ USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeReceipt.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="p-3 font-sans font-bold text-slate-800">{item.name}</td>
                    <td className="p-3 text-center">{item.quantity}</td>
                    <td className="p-3 text-right">${(item.unitPrice / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 text-right font-bold text-slate-900">
                      ${((item.unitPrice * item.quantity) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Financial Summary */}
            <div className="flex justify-end pt-4 border-t border-slate-200">
              <div className="w-64 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>${activeReceipt.subtotalDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                {activeReceipt.discountDollars > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Discount:</span>
                    <span>-${activeReceipt.discountDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Sales Tax ({activeTaxRate}%):</span>
                  <span>+${activeReceipt.taxDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-300 pt-2 font-sans">
                  <span>Total Paid:</span>
                  <span className="font-mono text-emerald-600">
                    ${activeReceipt.grandTotalDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </span>
                </div>
              </div>
            </div>

            {/* QR Verification Seal & General Ledger Commit */}
            <div className="p-4 bg-slate-950 rounded-2xl text-emerald-400 font-mono text-xs space-y-2 shadow-inner">
              <div className="flex justify-between items-center">
                <span className="font-bold text-indigo-400 font-sans">🏛️ General Ledger Automated Accounting Entry:</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">QR Seal: {activeReceipt.qrVerificationCode.slice(0, 24)}...</span>
              </div>
              <div className="text-[11px] space-y-0.5">
                <div>• Journal ID: {activeReceipt.generalLedgerCommit.journalId}</div>
                <div>• Debit: {activeReceipt.generalLedgerCommit.debitAccount} (${activeReceipt.generalLedgerCommit.amount})</div>
                <div>• Credit: {activeReceipt.generalLedgerCommit.creditAccount} (${activeReceipt.subtotalDollars})</div>
                <div>• Credit: {activeReceipt.generalLedgerCommit.taxAccount} (${activeReceipt.taxDollars})</div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap gap-3 pt-4 border-t">
              <Button onClick={handleDownloadPdf} className="flex-1 !bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold">
                📥 Download Official PDF Tax Receipt
              </Button>
              <Button variant="outline" onClick={() => window.print()} className="font-bold">
                🖨️ Print Receipt
              </Button>
              <Button variant="outline" onClick={() => setActiveStudioTab('CART')} className="font-bold">
                ← Return to Cart
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── TAB 3: 5 PAYMENT DECLINE & RECOVERY SCENARIOS ───────────────────────── */}
      {activeStudioTab === 'FAILURES' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="border-b pb-3">
            <h3 className="text-base font-black text-slate-900">🚨 Payment Decline & Edge-Case Recovery Simulator</h3>
            <p className="text-xs text-slate-500">
              Test all 5 real-world payment failures and verify automated smart recovery handlers.
            </p>
          </div>

          {/* 5 Scenario Trigger Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              onClick={() => handleSimulateFailure('INSUFFICIENT_FUNDS')}
              className="p-4 bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 rounded-2xl text-left space-y-1 transition"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-amber-900">1. Insufficient Funds</span>
                <Badge variant="warning">Soft Decline</Badge>
              </div>
              <p className="text-[11px] text-amber-800/80">Triggers Smart Dunning Retry Timeline (Day 1, 3, 7)</p>
            </button>

            <button
              onClick={() => handleSimulateFailure('EXPIRED_CARD')}
              className="p-4 bg-rose-50 hover:bg-rose-100 border-2 border-rose-300 rounded-2xl text-left space-y-1 transition"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-rose-900">2. Expired Saved Card</span>
                <Badge variant="danger">Hard Decline</Badge>
              </div>
              <p className="text-[11px] text-rose-800/80">Auto-falls back to secondary saved payment method</p>
            </button>

            <button
              onClick={() => handleSimulateFailure('3DS_CHALLENGE')}
              className="p-4 bg-indigo-50 hover:bg-indigo-100 border-2 border-indigo-300 rounded-2xl text-left space-y-1 transition"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-indigo-900">3. 3D-Secure 2.0 (SCA)</span>
                <Badge variant="primary">Bank Challenge</Badge>
              </div>
              <p className="text-[11px] text-indigo-800/80">Opens interactive Bank SMS OTP challenge modal</p>
            </button>

            <button
              onClick={() => handleSimulateFailure('FRAUD_BLOCK')}
              className="p-4 bg-purple-50 hover:bg-purple-100 border-2 border-purple-300 rounded-2xl text-left space-y-1 transition"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-purple-900">4. Fraud Risk Block</span>
                <Badge variant="danger">Score 92</Badge>
              </div>
              <p className="text-[11px] text-purple-800/80">Quarantines order & alerts Risk Operations team</p>
            </button>

            <button
              onClick={() => handleSimulateFailure('ACH_RETURN')}
              className="p-4 bg-blue-50 hover:bg-blue-100 border-2 border-blue-300 rounded-2xl text-left space-y-1 transition"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-blue-900">5. ACH Return R01</span>
                <Badge variant="info">ACH Return</Badge>
              </div>
              <p className="text-[11px] text-blue-800/80">Auto-routes debit failure to backup credit card</p>
            </button>
          </div>

          {/* Active Failure Result Card */}
          {activeFailure && (
            <Card className="p-6 space-y-5 border-2 border-rose-300 bg-rose-50/50">
              <div className="flex justify-between items-start border-b border-rose-200 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <h4 className="font-black text-rose-950 text-base">{activeFailure.failureCode}</h4>
                  </div>
                  <p className="text-xs text-rose-800 mt-1">{activeFailure.failureReason}</p>
                </div>
                <Badge variant={activeFailure.declineType === 'SOFT_DECLINE' ? 'warning' : 'danger'}>
                  {activeFailure.declineType}
                </Badge>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-rose-200 text-xs space-y-2">
                <strong className="text-slate-900 block font-sans">⚡ Automated Recovery Flow Triggered:</strong>
                <p className="text-indigo-900 font-mono text-[11px]">{activeFailure.automatedRecoveryAction}</p>

                {activeFailure.suggestedAlternativePaymentMethod && (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 font-bold text-xs mt-2">
                    ✓ Secondary Method Active: {activeFailure.suggestedAlternativePaymentMethod}
                  </div>
                )}
              </div>

              {/* Dunning Schedule Preview */}
              {activeFailure.dunningSchedule.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold uppercase text-slate-500 block">
                    Automated Dunning Retry Schedule:
                  </span>
                  <div className="space-y-1.5 font-mono text-xs">
                    {activeFailure.dunningSchedule.map((s, idx) => (
                      <div key={idx} className="p-3 bg-slate-900 text-white rounded-xl flex justify-between items-center">
                        <span>Day {s.day}: {s.action}</span>
                        <Badge variant={s.status === 'EXECUTED' ? 'success' : 'warning'}>{s.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ─── TAB 4: SMART DUNNING RETRY TIMELINE ───────────────────────────────── */}
      {activeStudioTab === 'DUNNING' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="border-b pb-3">
            <h3 className="text-base font-black text-slate-900">🔄 Smart Dunning Retry Timeline & Recovery Engine</h3>
            <p className="text-xs text-slate-500">
              Recovers 85%+ of soft-declined invoices through intelligent multi-day payment retries.
            </p>
          </div>

          <div className="space-y-4 text-xs font-mono">
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-base shadow-xs">
                D1
              </div>
              <div className="flex-1">
                <strong className="text-indigo-950 font-sans text-sm block">Day 1: First Smart Retry Attempt</strong>
                <p className="text-indigo-800 text-[11px]">Executes off-peak bank batch processing. Dispatches friendly email notice to controller.</p>
              </div>
              <Badge variant="success">Auto-Scheduled</Badge>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-base shadow-xs">
                D3
              </div>
              <div className="flex-1">
                <strong className="text-indigo-950 font-sans text-sm block">Day 3: Second Retry & SMS Push Alert</strong>
                <p className="text-indigo-800 text-[11px]">Triggers secondary card authorization probe and sends SMS update link.</p>
              </div>
              <Badge variant="success">Auto-Scheduled</Badge>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-600 text-white rounded-xl flex items-center justify-center font-bold text-base shadow-xs">
                D7
              </div>
              <div className="flex-1">
                <strong className="text-amber-950 font-sans text-sm block">Day 7: Final Automated Retry & Grace Period</strong>
                <p className="text-amber-800 text-[11px]">Last automated attempt before temporarily placing software seats in read-only grace period.</p>
              </div>
              <Badge variant="warning">Grace Period</Badge>
            </div>
          </div>
        </Card>
      )}

      {/* ─── TAB 5: SAVED PAYMENT METHODS VAULT ─────────────────────────────────── */}
      {activeStudioTab === 'SAVED_VAULT' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900">💳 Tokenized Payment Methods Vault</h3>
              <p className="text-xs text-slate-500">
                PCI-DSS compliant saved cards, ACH corporate bank accounts, and Apple Pay tokens.
              </p>
            </div>
            <Button size="sm" onClick={() => setIsAddCardModalOpen(true)}>
              + Save & Tokenize New Card
            </Button>
          </div>

          <div className="space-y-3 text-xs">
            {savedPayments.map((pm) => (
              <div
                key={pm.id}
                className={`p-4 rounded-2xl border flex flex-wrap justify-between items-center gap-4 transition ${
                  pm.isDefault ? 'bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-500/20' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white rounded-xl border flex items-center justify-center text-2xl shadow-xs font-mono">
                    {pm.type === 'CARD' ? '💳' : '🏦'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-900 text-sm">{pm.brand}</strong>
                      <span className="font-mono font-bold text-slate-700">•••• {pm.last4}</span>
                      {pm.isDefault && <Badge variant="primary">DEFAULT METHOD</Badge>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {pm.holderName} {pm.expMonth && `• Exp: ${pm.expMonth}/${pm.expYear}`} {pm.bankName && `• ${pm.bankName}`}
                    </p>
                  </div>
                </div>

                <div>
                  {!pm.isDefault ? (
                    <Button size="sm" variant="outline" onClick={() => handleSetDefaultPayment(pm.id)}>
                      Set as Default
                    </Button>
                  ) : (
                    <span className="text-indigo-600 font-bold text-xs">✓ Active Default</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal: 3D-Secure 2.0 Bank Challenge */}
      {is3dsModalOpen && challenge3dsData && (
        <Modal
          isOpen={is3dsModalOpen}
          onClose={() => setIs3dsModalOpen(false)}
          title="🔐 3D-Secure 2.0 Strong Customer Authentication"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-900 text-white rounded-2xl text-center space-y-1">
              <span className="text-[10px] text-indigo-300 uppercase font-bold block">{challenge3dsData.bankName}</span>
              <div className="text-xl font-black text-emerald-400 font-mono">
                Authorizing Charge: ${challenge3dsData.amountDue.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
              </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 text-indigo-950 space-y-1">
              <strong className="block font-sans">Enter One-Time SMS Verification Passcode:</strong>
              <p className="text-[11px]">We sent a verification code to your mobile phone (•••) •••-9201.</p>
              <div className="text-[11px] font-mono text-indigo-600 font-bold mt-1">Hint / Demo Passcode: {challenge3dsData.otpHint}</div>
            </div>

            <div>
              <Input
                placeholder="Enter 6-digit code (e.g. 849-201)"
                value={inputOtpCode}
                onChange={(e) => setInputOtpCode(e.target.value)}
              />
            </div>

            <Button onClick={handleVerify3dsOtp} className="w-full !bg-indigo-600 !text-white font-bold">
              Verify & Complete Payment 🔒
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal: Add Saved Card */}
      {isAddCardModalOpen && (
        <Modal
          isOpen={isAddCardModalOpen}
          onClose={() => setIsAddCardModalOpen(false)}
          title="💳 Save & Tokenize Payment Card to Vault"
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold block mb-1">Cardholder Full Name</label>
              <Input value={newCardHolder} onChange={(e) => setNewCardHolder(e.target.value)} />
            </div>

            <div>
              <label className="font-bold block mb-1">Card Number (Tokenized via Stripe Vault)</label>
              <Input value={newCardNumber} onChange={(e) => setNewCardNumber(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Expiration (MM/YY)</label>
                <Input value={newCardExp} onChange={(e) => setNewCardExp(e.target.value)} />
              </div>
              <div>
                <label className="font-bold block mb-1">CVC / CVV</label>
                <Input value="882" readOnly />
              </div>
            </div>

            <Button onClick={handleSaveCard} className="w-full !bg-indigo-600 !text-white font-bold">
              Tokenize & Save Card 🔒
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
