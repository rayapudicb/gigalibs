'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Package,
  Layers,
  Tag,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronRight,
  Shield,
  FileText,
  DollarSign,
  Scale,
  Building,
  TrendingUp,
  Sliders,
  History,
  Info,
} from 'lucide-react';
import type {
  ProductV1,
  ProductCategoryV1,
  UomDefinitionV1,
  PriceListV1,
  PriceResolutionResultV1,
  ProductType,
  ProductStatus,
  CompiledDictionaryManifestV1,
} from '@gigalibs/contracts';
import { DictionaryRenderer } from '@gigalibs/configuration-react';
import { validateDictionaryRules } from '@gigalibs/configuration-core';

type DossierTab = 'overview' | 'pricing' | 'uoms' | 'identifiers' | 'extensions';

const DEFAULT_PRODUCT_DICTIONARY_MANIFEST: CompiledDictionaryManifestV1 = {
  manifestVersion: 1,
  packageKey: 'pkg-product-catalogue',
  checksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  compiledAt: '2026-10-03T00:00:00.000Z',
  entities: [
    {
      entityKey: 'products',
      moduleKey: 'product-catalogue',
      label: 'Products & Services',
      description: 'Governed catalogue of physical items, services, and bundles.',
      ownership: 'MODULE_CORE',
      primaryKeyField: 'id',
      isVersioned: true,
      isAuditLogged: true,
      isSoftDeletable: false,
    },
  ],
  fields: [
    {
      fieldKey: 'warranty_months',
      entityKey: 'products',
      label: 'Warranty Period (Months)',
      description: 'Standard manufacturer or tenant warranty duration.',
      type: 'INTEGER',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'Enter warranty in months (0 for no warranty).',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'sustainability_score',
      entityKey: 'products',
      label: 'Sustainability Rating',
      description: 'ESG and carbon efficiency grade.',
      type: 'SELECT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      referenceKey: 'ref-sustainability-grade',
      helpText: 'Environmental impact grade from A to D.',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'country_of_origin',
      entityKey: 'products',
      label: 'Country of Origin',
      description: 'Two-letter ISO country code of manufacturing origin.',
      type: 'TEXT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. US, DE, JP, IN.',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'special_handling_notes',
      entityKey: 'products',
      label: 'Special Handling & Storage',
      description: 'Instructions for handling, hazardous warnings, or temperature limits.',
      type: 'TEXTAREA',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'Store in dry place, fragile, hazmat class, etc.',
      maskOnDisplay: false,
    },
  ],
  relationships: [],
  references: [
    {
      referenceKey: 'ref-sustainability-grade',
      referenceType: 'VALUE_LIST',
      staticValues: [
        { value: 'GRADE_A', label: 'Grade A (Net Zero / Recycled)' },
        { value: 'GRADE_B', label: 'Grade B (Low Carbon)' },
        { value: 'GRADE_C', label: 'Grade C (Standard Compliant)' },
        { value: 'GRADE_D', label: 'Grade D (Legacy / High Emission)' },
      ],
    },
  ],
  validationRules: [
    {
      ruleKey: 'rule-warranty-non-negative',
      label: 'Warranty Non-Negative',
      errorMessage: 'Warranty months must be greater than or equal to 0.',
      severity: 'ERROR',
      condition: {
        field: 'warranty_months',
        operator: 'GTE',
        value: 0,
      },
    },
  ],
  views: [
    {
      viewKey: 'view-product-extensions',
      label: 'Product Custom Attributes',
      mode: 'EDIT',
      device: 'ALL',
      defaultSortDirection: 'ASC',
      tabs: [
        {
          tabKey: 'tab-attributes',
          label: 'Custom Attributes',
          position: 1,
          level: 0,
          targetEntityKey: 'products',
          sections: [
            {
              sectionKey: 'sec-specifications',
              label: 'Compliance & Specifications',
              description: 'Tenant-extended compliance and operational parameters.',
              collapsible: false,
              defaultCollapsed: false,
              position: 1,
            },
          ],
          fields: [
            {
              fieldKey: 'warranty_months',
              sectionKey: 'sec-specifications',
              position: 1,
              span: 6,
              componentKey: 'number-input',
            },
            {
              fieldKey: 'sustainability_score',
              sectionKey: 'sec-specifications',
              position: 2,
              span: 6,
              componentKey: 'select-dropdown',
            },
            {
              fieldKey: 'country_of_origin',
              sectionKey: 'sec-specifications',
              position: 3,
              span: 6,
              componentKey: 'text-input',
            },
            {
              fieldKey: 'special_handling_notes',
              sectionKey: 'sec-specifications',
              position: 4,
              span: 12,
              componentKey: 'textarea',
            },
          ],
        },
      ],
    },
  ],
  navigation: [],
  actions: [],
  messages: [],
};

export function ProductCatalogueWorkspace() {
  const [products, setProducts] = useState<ProductV1[]>([]);
  const [categories, setCategories] = useState<ProductCategoryV1[]>([]);
  const [uoms, setUoms] = useState<UomDefinitionV1[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListV1[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Selected product dossier
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductV1 | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<DossierTab>('overview');

  // Modals & Panels
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showUomModal, setShowUomModal] = useState<boolean>(false);
  const [showPriceListModal, setShowPriceListModal] = useState<boolean>(false);
  const [showResolverTool, setShowResolverTool] = useState<boolean>(false);

  // Create Product Form
  const [newProduct, setNewProduct] = useState({
    code: '',
    name: '',
    displayName: '',
    description: '',
    productType: 'GOOD' as ProductType,
    baseUomId: '',
    categoryId: '',
    isSold: true,
    isPurchased: false,
    isStocked: true,
    dataClassification: 'INTERNAL' as const,
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Application Dictionary State
  const [runtimeManifest, setRuntimeManifest] = useState<CompiledDictionaryManifestV1>(DEFAULT_PRODUCT_DICTIONARY_MANIFEST);
  const [currentExtensions, setCurrentExtensions] = useState<Record<string, unknown>>({});
  const [extensionErrors, setExtensionErrors] = useState<Record<string, string>>({});
  const [savingExtensions, setSavingExtensions] = useState<boolean>(false);
  const [extensionSaveError, setExtensionSaveError] = useState<string | null>(null);
  const [createExtensions, setCreateExtensions] = useState<Record<string, unknown>>({});
  const [createExtensionErrors, setCreateExtensionErrors] = useState<Record<string, string>>({});
  const [showCreateExtensions, setShowCreateExtensions] = useState<boolean>(true);

  // Price Resolver Tool State
  const [resolveInput, setResolveInput] = useState({
    currencyCode: 'USD',
    quantity: '1',
    orgUnitId: '',
  });
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<PriceResolutionResultV1 | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // New UOM Form State
  const [newUom, setNewUom] = useState({
    code: '',
    name: '',
    symbol: '',
    dimension: 'COUNT' as const,
    stdPrecision: 2,
    costingPrecision: 4,
  });
  const [uomSubmitting, setUomSubmitting] = useState(false);
  const [uomError, setUomError] = useState<string | null>(null);

  // New Price List Form State
  const [newPriceList, setNewPriceList] = useState({
    code: '',
    name: '',
    currencyCode: 'USD',
    isTaxIncluded: false,
    enforcePriceLimit: true,
  });
  const [priceListSubmitting, setPriceListSubmitting] = useState(false);
  const [priceListError, setPriceListError] = useState<string | null>(null);

  // Fetch reference metadata (categories, uoms, priceLists)
  const fetchMetadata = useCallback(async () => {
    try {
      const [catRes, uomRes, plRes] = await Promise.all([
        fetch('/api/product-catalogue/v1/product-categories'),
        fetch('/api/product-catalogue/v1/uoms'),
        fetch('/api/product-catalogue/v1/price-lists'),
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(Array.isArray(catData) ? catData : catData.items ?? []);
      }
      if (uomRes.ok) {
        const uomData = await uomRes.json();
        const uomList = Array.isArray(uomData) ? uomData : uomData.items ?? [];
        setUoms(uomList);
        if (uomList.length > 0 && !newProduct.baseUomId) {
          setNewProduct((prev) => ({ ...prev, baseUomId: uomList[0].id }));
        }
      }
      if (plRes.ok) {
        const plData = await plRes.json();
        setPriceLists(Array.isArray(plData) ? plData : plData.items ?? []);
      }
    } catch {
      // Non-blocking metadata prefetch
    }
  }, [newProduct.baseUomId]);

  // Fetch product list
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (typeFilter !== 'ALL') params.set('productType', typeFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      params.set('limit', '50');

      const res = await fetch(`/api/product-catalogue/v1/products?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load products: HTTP ${res.status}`);
      }
      const data = await res.json();
      const items: ProductV1[] = data.items ?? [];
      setProducts(items);
      setTotalCount(data.totalCount ?? items.length);

      if (items.length > 0 && !selectedProductId) {
        setSelectedProductId(items[0].id);
        setSelectedProduct(items[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Could not connect to Product Catalogue service.');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, selectedProductId]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    async function loadDictionaryManifest() {
      try {
        const query = new URLSearchParams({
          moduleKey: 'product-catalogue',
          entityKey: 'products',
          surfaceKey: 'product-catalogue',
        });
        const res = await fetch(`/api/control/configuration/runtime/manifest/current?${query}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.manifestVersion) {
            setRuntimeManifest(data as CompiledDictionaryManifestV1);
          }
        }
      } catch {
        // Fall back gracefully to DEFAULT_PRODUCT_DICTIONARY_MANIFEST
      }
    }
    loadDictionaryManifest();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      const exts = (selectedProduct.customExtensions as Record<string, unknown>) || {};
      setCurrentExtensions(exts);
      setExtensionErrors(validateDictionaryRules(runtimeManifest.validationRules, exts));
      setExtensionSaveError(null);
    } else {
      setCurrentExtensions({});
      setExtensionErrors({});
      setExtensionSaveError(null);
    }
  }, [selectedProduct, runtimeManifest]);

  const handleSaveExtensions = async () => {
    if (!selectedProduct) return;
    const errors = validateDictionaryRules(runtimeManifest.validationRules, currentExtensions);
    setExtensionErrors(errors);
    if (Object.keys(errors).length > 0) {
      setExtensionSaveError('Please correct the validation errors before saving.');
      return;
    }
    setSavingExtensions(true);
    setExtensionSaveError(null);
    try {
      const res = await fetch(`/api/product-catalogue/v1/products/${selectedProduct.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          expectedVersion: selectedProduct.version,
          customExtensions: currentExtensions,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed with HTTP ${res.status}`);
      }
      const updated = (await res.json()) as ProductV1;
      setSelectedProduct(updated);
      setNotice(`Custom attributes for "${updated.name}" saved successfully.`);
      fetchProducts();
    } catch (e: any) {
      setExtensionSaveError(e.message || 'Failed to save attributes.');
    } finally {
      setSavingExtensions(false);
    }
  };

  const loadProductDetail = async (id: string) => {
    setSelectedProductId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/product-catalogue/v1/products/${id}`);
      if (!res.ok) throw new Error(`Could not load product detail: HTTP ${res.status}`);
      const data = await res.json();
      setSelectedProduct(data);
    } catch (err: any) {
      setNotice(`Failed to load details: ${err.message}`);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);

    try {
      if (!newProduct.code.trim()) throw new Error('Product code is required.');
      if (!newProduct.name.trim()) throw new Error('Product name is required.');
      if (!newProduct.baseUomId) throw new Error('A base unit of measure is required.');

      const errs = validateDictionaryRules(runtimeManifest.validationRules, createExtensions);
      setCreateExtensionErrors(errs);
      if (Object.keys(errs).length > 0) {
        throw new Error('Please resolve Application Dictionary attribute errors.');
      }

      const payload = {
        code: newProduct.code.trim().toUpperCase(),
        name: newProduct.name.trim(),
        displayName: newProduct.displayName.trim() || undefined,
        description: newProduct.description.trim() || undefined,
        productType: newProduct.productType,
        baseUomId: newProduct.baseUomId,
        categoryId: newProduct.categoryId || undefined,
        isSold: newProduct.isSold,
        isPurchased: newProduct.isPurchased,
        isStocked: newProduct.productType === 'SERVICE' || newProduct.productType === 'RESOURCE' ? false : newProduct.isStocked,
        dataClassification: newProduct.dataClassification,
        customExtensions: Object.keys(createExtensions).length > 0 ? createExtensions : undefined,
      };

      const res = await fetch('/api/product-catalogue/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Server returned HTTP ${res.status}`);
      }

      const created = await res.json();
      setShowCreateModal(false);
      setCreateExtensions({});
      setCreateExtensionErrors({});
      setNotice(`Product "${created.name}" created successfully.`);
      fetchProducts();
      setSelectedProductId(created.id);
      setSelectedProduct(created);
    } catch (err: any) {
      setCreateError(err.message || 'Creation failed.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleResolvePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;
    setResolving(true);
    setResolveError(null);
    setResolveResult(null);

    try {
      const payload = {
        productId: selectedProductId,
        currencyCode: resolveInput.currencyCode,
        quantity: resolveInput.quantity || '1',
        orgUnitId: resolveInput.orgUnitId.trim() || undefined,
      };

      const res = await fetch('/api/product-catalogue/v1/prices/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `No price resolved: HTTP ${res.status}`);
      }

      const result = await res.json();
      setResolveResult(result);
    } catch (err: any) {
      setResolveError(err.message || 'Price resolution failed.');
    } finally {
      setResolving(false);
    }
  };

  const handleCreateUom = async (e: React.FormEvent) => {
    e.preventDefault();
    setUomSubmitting(true);
    setUomError(null);

    try {
      if (!newUom.code.trim()) throw new Error('Code is required.');
      if (!newUom.name.trim()) throw new Error('Name is required.');
      if (!newUom.symbol.trim()) throw new Error('Symbol is required.');

      const res = await fetch('/api/product-catalogue/v1/uoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(newUom),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }

      setShowUomModal(false);
      setNotice('Unit of measure created successfully.');
      fetchMetadata();
    } catch (err: any) {
      setUomError(err.message);
    } finally {
      setUomSubmitting(false);
    }
  };

  const handleCreatePriceList = async (e: React.FormEvent) => {
    e.preventDefault();
    setPriceListSubmitting(true);
    setPriceListError(null);

    try {
      if (!newPriceList.code.trim()) throw new Error('Code is required.');
      if (!newPriceList.name.trim()) throw new Error('Name is required.');

      const res = await fetch('/api/product-catalogue/v1/price-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(newPriceList),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }

      setShowPriceListModal(false);
      setNotice('Price list created successfully.');
      fetchMetadata();
    } catch (err: any) {
      setPriceListError(err.message);
    } finally {
      setPriceListSubmitting(false);
    }
  };

  // Metrics summary
  const activeCount = products.filter((p) => p.status === 'ACTIVE').length;
  const goodCount = products.filter((p) => p.productType === 'GOOD').length;
  const serviceCount = products.filter((p) => p.productType === 'SERVICE' || p.productType === 'RESOURCE').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" role="main" aria-label="Product and Catalogue Studio">
      {/* Notifications */}
      {notice && (
        <div
          role="status"
          className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-200 rounded-xl flex items-center justify-between animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium">{notice}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-emerald-400 hover:text-emerald-300"
            aria-label="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 bg-rose-950/60 border border-rose-800 text-rose-200 rounded-xl flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Boxes className="w-7 h-7 text-indigo-400" aria-hidden="true" />
            Product & Catalogue Studio
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Governed multi-tenant product, service, UOM, catalogue, and effective-dated list pricing authority.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              fetchMetadata();
              fetchProducts();
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition"
            title="Refresh Directory"
            aria-label="Refresh product list"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowUomModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition"
            aria-label="Open Unit of Measure management"
          >
            <Scale className="w-4 h-4 text-emerald-400" />
            UOMs ({uoms.length})
          </button>
          <button
            onClick={() => setShowPriceListModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition"
            aria-label="Open Price Lists management"
          >
            <DollarSign className="w-4 h-4 text-amber-400" />
            Price Lists ({priceLists.length})
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm transition"
            aria-label="Create new product"
          >
            <Plus className="w-4 h-4" />
            New Product
          </button>
        </div>
      </div>

      {/* Overview Stat Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Catalogue Metrics">
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Products</div>
          <div className="text-2xl font-semibold text-white mt-1">{totalCount}</div>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Active Items</div>
          <div className="text-2xl font-semibold text-emerald-400 mt-1">{activeCount}</div>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Stocked Goods</div>
          <div className="text-2xl font-semibold text-indigo-400 mt-1">{goodCount}</div>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Services & Resources</div>
          <div className="text-2xl font-semibold text-purple-400 mt-1">{serviceCount}</div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Filter Bar & Table (7 cols on desktop) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Filters */}
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or product name..."
                aria-label="Search products"
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by product type"
                className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Types</option>
                <option value="GOOD">Goods</option>
                <option value="SERVICE">Services</option>
                <option value="DIGITAL">Digital</option>
                <option value="RESOURCE">Resource</option>
                <option value="BUNDLE">Bundle</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="DISCONTINUED">Discontinued</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-300" aria-label="Products directory">
                <thead className="bg-zinc-800/60 text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Code / Name</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Base UOM</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Flags</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                        Loading product catalogue records...
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                        No products match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    products.map((item) => {
                      const isSelected = item.id === selectedProductId;
                      const uomDef = uoms.find((u) => u.id === item.baseUomId);

                      return (
                        <tr
                          key={item.id}
                          onClick={() => loadProductDetail(item.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-indigo-950/40 border-l-4 border-indigo-500'
                              : 'hover:bg-zinc-800/40'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{item.name}</div>
                            <div className="text-xs text-zinc-500 font-mono mt-0.5">{item.code}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                              {item.productType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-300 font-mono">
                            {uomDef ? `${uomDef.code} (${uomDef.symbol})` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {item.isSold && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800" title="Sold">
                                  S
                                </span>
                              )}
                              {item.isPurchased && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-950/80 text-blue-400 border border-blue-800" title="Purchased">
                                  P
                                </span>
                              )}
                              {item.isStocked && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-950/80 text-amber-400 border border-amber-800" title="Stocked">
                                  ST
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                item.status === 'ACTIVE'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : item.status === 'DRAFT'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="w-4 h-4 text-zinc-500 inline-block" />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Product Detail Dossier (5 cols on desktop) */}
        <div className="lg:col-span-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden sticky top-6 shadow-sm">
            {loadingDetail ? (
              <div className="p-8 text-center text-zinc-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                Loading product detail...
              </div>
            ) : selectedProduct ? (
              <div>
                {/* Dossier Header */}
                <div className="p-5 border-b border-zinc-800 bg-zinc-850">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-indigo-400 font-semibold uppercase">
                          {selectedProduct.code}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            selectedProduct.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {selectedProduct.status}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-white mt-1">{selectedProduct.name}</h2>
                      {selectedProduct.description && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{selectedProduct.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-zinc-800 mt-4 -mb-5 gap-4 overflow-x-auto text-xs" role="tablist">
                    {(['overview', 'pricing', 'uoms', 'identifiers', 'extensions'] as DossierTab[]).map((tab) => (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={activeTab === tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-3 font-medium transition border-b-2 capitalize whitespace-nowrap ${
                          activeTab === tab
                            ? 'text-indigo-400 border-indigo-500'
                            : 'text-zinc-400 border-transparent hover:text-zinc-200'
                        }`}
                      >
                        {tab === 'pricing' ? 'Pricing & Simulator' : tab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Contents */}
                <div className="p-5 max-h-[calc(100vh-280px)] overflow-y-auto space-y-4">
                  {/* OVERVIEW TAB */}
                  {activeTab === 'overview' && (
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 gap-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                        <div>
                          <div className="text-zinc-500">Product Type</div>
                          <div className="text-white font-medium mt-0.5">{selectedProduct.productType}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Data Classification</div>
                          <div className="text-white font-medium mt-0.5">{selectedProduct.dataClassification}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Version</div>
                          <div className="text-white font-medium mt-0.5">v{selectedProduct.version}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Base Unit</div>
                          <div className="text-white font-medium mt-0.5">
                            {uoms.find((u) => u.id === selectedProduct.baseUomId)?.name ?? '—'}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-zinc-400 font-semibold uppercase tracking-wider mb-2">Commercial Flags</div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              selectedProduct.isSold
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-zinc-800 text-zinc-500'
                            }`}
                          >
                            {selectedProduct.isSold ? '✓ Sellable' : '✗ Not Sold'}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              selectedProduct.isPurchased
                                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                : 'bg-zinc-800 text-zinc-500'
                            }`}
                          >
                            {selectedProduct.isPurchased ? '✓ Purchasable' : '✗ Not Purchased'}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              selectedProduct.isStocked
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-zinc-800 text-zinc-500'
                            }`}
                          >
                            {selectedProduct.isStocked ? '✓ Stocked Inventory' : '✗ Non-Stocked'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-500 space-y-1">
                        <div>ID: <span className="font-mono text-zinc-400">{selectedProduct.id}</span></div>
                        <div>Created: <span className="text-zinc-400">{new Date(selectedProduct.createdAt).toLocaleString()}</span></div>
                        <div>Updated: <span className="text-zinc-400">{new Date(selectedProduct.updatedAt).toLocaleString()}</span></div>
                      </div>
                    </div>
                  )}

                  {/* PRICING & SIMULATOR TAB */}
                  {activeTab === 'pricing' && (
                    <div className="space-y-4">
                      <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <TrendingUp className="w-4 h-4 text-amber-400" />
                          Effective Price Simulator
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Resolve governed pricing based on currency, quantity breaks, organization scope, and effective date.
                        </p>

                        <form onSubmit={handleResolvePrice} className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-zinc-400">Currency</label>
                              <input
                                type="text"
                                value={resolveInput.currencyCode}
                                onChange={(e) => setResolveInput({ ...resolveInput, currencyCode: e.target.value.toUpperCase() })}
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-white font-mono"
                                placeholder="USD"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-zinc-400">Quantity</label>
                              <input
                                type="text"
                                value={resolveInput.quantity}
                                onChange={(e) => setResolveInput({ ...resolveInput, quantity: e.target.value })}
                                className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-white"
                                placeholder="1"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={resolving}
                            className="w-full py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded transition disabled:opacity-50"
                          >
                            {resolving ? 'Resolving...' : 'Calculate Effective Price'}
                          </button>
                        </form>

                        {resolveError && (
                          <div className="p-2 bg-rose-950/60 border border-rose-800 text-rose-300 rounded text-[11px]">
                            {resolveError}
                          </div>
                        )}

                        {resolveResult && (
                          <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg space-y-2 text-xs">
                            <div className="text-zinc-400 font-semibold">Resolution Result:</div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                                <div className="text-[10px] text-zinc-500">List Price</div>
                                <div className="text-sm font-bold text-white font-mono">
                                  ${(parseInt(resolveResult.listPriceMinor, 10) / 100).toFixed(2)}
                                </div>
                              </div>
                              <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                                <div className="text-[10px] text-zinc-500">Standard</div>
                                <div className="text-sm font-bold text-emerald-400 font-mono">
                                  ${(parseInt(resolveResult.standardPriceMinor, 10) / 100).toFixed(2)}
                                </div>
                              </div>
                              <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                                <div className="text-[10px] text-zinc-500">Limit Price</div>
                                <div className="text-sm font-bold text-amber-400 font-mono">
                                  ${(parseInt(resolveResult.limitPriceMinor, 10) / 100).toFixed(2)}
                                </div>
                              </div>
                            </div>
                            <div className="text-[11px] text-zinc-400 space-y-0.5 pt-1">
                              <div>Rule: <span className="text-zinc-200">{resolveResult.resolutionTrace.precedenceRule}</span></div>
                              <div>Version: <span className="text-zinc-200">{resolveResult.resolutionTrace.versionSelected}</span></div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-zinc-400">
                        Governed by immutable Price List Versions. Direct edits to published prices are strictly disallowed by ADR-0021.
                      </div>
                    </div>
                  )}

                  {/* UOMS TAB */}
                  {activeTab === 'uoms' && (
                    <div className="space-y-3 text-xs">
                      <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                        <div className="text-zinc-400 font-semibold mb-1">Base Unit of Measure</div>
                        <div className="text-white font-medium">
                          {uoms.find((u) => u.id === selectedProduct.baseUomId)?.name} (
                          {uoms.find((u) => u.id === selectedProduct.baseUomId)?.code})
                        </div>
                        <div className="text-zinc-500 text-[11px] mt-1">
                          Standard precision: {uoms.find((u) => u.id === selectedProduct.baseUomId)?.stdPrecision} decimals | Dimension: {uoms.find((u) => u.id === selectedProduct.baseUomId)?.dimension}
                        </div>
                      </div>

                      <div className="text-[11px] text-zinc-400">
                        UOM conversions are evaluated deterministically with bounded precision. Product-specific conversion rates override platform standard conversion factors.
                      </div>
                    </div>
                  )}

                  {/* IDENTIFIERS TAB */}
                  {activeTab === 'identifiers' && (
                    <div className="space-y-3 text-xs">
                      <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-center text-zinc-500">
                        No external identifiers (SKU, GTIN, Barcode) configured yet for this product.
                      </div>
                    </div>
                  )}

                  {/* EXTENSIONS TAB */}
                  {activeTab === 'extensions' && (
                    <div className="space-y-4 text-xs">
                      <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                        <div>
                          <div className="text-zinc-200 font-semibold flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-indigo-400" />
                            Tenant Dynamic Attributes
                          </div>
                          <div className="text-zinc-500 text-[11px] mt-0.5">
                            Governed by Application Dictionary (<span className="font-mono text-zinc-400">product-catalogue-v1</span>). Custom tenant attributes configured without runtime DDL migrations.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveExtensions}
                          disabled={savingExtensions}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                        >
                          {savingExtensions ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Save Attributes
                            </>
                          )}
                        </button>
                      </div>

                      {extensionSaveError && (
                        <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                          {extensionSaveError}
                        </div>
                      )}

                      <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                        <DictionaryRenderer
                          manifest={runtimeManifest}
                          values={currentExtensions}
                          errors={extensionErrors}
                          disabled={savingExtensions}
                          onChange={(newValues) => {
                            setCurrentExtensions(newValues);
                            const errs = validateDictionaryRules(runtimeManifest.validationRules, newValues);
                            setExtensionErrors(errs);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500">
                Select a product from the directory to view its governed dossier.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREATE PRODUCT MODAL */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-product-title"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h2 id="create-product-title" className="text-lg font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-400" />
                Create New Product
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Product Code *</label>
                  <input
                    type="text"
                    required
                    value={newProduct.code}
                    onChange={(e) => setNewProduct({ ...newProduct, code: e.target.value })}
                    placeholder="e.g. SK-1001"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Product Type *</label>
                  <select
                    value={newProduct.productType}
                    onChange={(e) => setNewProduct({ ...newProduct, productType: e.target.value as ProductType })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="GOOD">Good (Physical)</option>
                    <option value="SERVICE">Service</option>
                    <option value="DIGITAL">Digital Item</option>
                    <option value="RESOURCE">Resource</option>
                    <option value="BUNDLE">Bundle</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  placeholder="Official product or service name"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Base Unit of Measure *</label>
                  <select
                    required
                    value={newProduct.baseUomId}
                    onChange={(e) => setNewProduct({ ...newProduct, baseUomId: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    <option value="">Select UOM...</option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} - {u.name} ({u.symbol})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Category</label>
                  <select
                    value={newProduct.categoryId}
                    onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  placeholder="Optional details, specifications or notes"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={newProduct.isSold}
                    onChange={(e) => setNewProduct({ ...newProduct, isSold: e.target.checked })}
                    className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  Sold
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={newProduct.isPurchased}
                    onChange={(e) => setNewProduct({ ...newProduct, isPurchased: e.target.checked })}
                    className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  Purchased
                </label>
                {newProduct.productType !== 'SERVICE' && newProduct.productType !== 'RESOURCE' && (
                  <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                    <input
                      type="checkbox"
                      checked={newProduct.isStocked}
                      onChange={(e) => setNewProduct({ ...newProduct, isStocked: e.target.checked })}
                      className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    Stocked
                  </label>
                )}
              </div>

              {/* Dynamic Application Dictionary Extensions */}
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCreateExtensions(!showCreateExtensions)}
                  className="w-full flex items-center justify-between text-left text-zinc-300 font-medium hover:text-white transition"
                >
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    Custom Attributes (Application Dictionary)
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {showCreateExtensions ? 'Collapse [-]' : 'Expand [+]'}
                  </span>
                </button>
                {showCreateExtensions && (
                  <div className="pt-2 border-t border-zinc-900">
                    <DictionaryRenderer
                      manifest={runtimeManifest}
                      values={createExtensions}
                      errors={createExtensionErrors}
                      disabled={createSubmitting}
                      onChange={(newValues) => {
                        setCreateExtensions(newValues);
                        const errs = validateDictionaryRules(runtimeManifest.validationRules, newValues);
                        setCreateExtensionErrors(errs);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {createSubmitting ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE UOM MODAL */}
      {showUomModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="uom-modal-title"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h2 id="uom-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-400" />
                Create Unit of Measure
              </h2>
              <button onClick={() => setShowUomModal(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {uomError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg">
                {uomError}
              </div>
            )}

            <form onSubmit={handleCreateUom} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">Code *</label>
                <input
                  type="text"
                  required
                  value={newUom.code}
                  onChange={(e) => setNewUom({ ...newUom, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. EA, KG, M, HR"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-zinc-400 font-medium mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={newUom.name}
                  onChange={(e) => setNewUom({ ...newUom, name: e.target.value })}
                  placeholder="e.g. Each, Kilogram, Meter, Hour"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Symbol *</label>
                  <input
                    type="text"
                    required
                    value={newUom.symbol}
                    onChange={(e) => setNewUom({ ...newUom, symbol: e.target.value })}
                    placeholder="e.g. ea, kg, m, hr"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Dimension *</label>
                  <select
                    value={newUom.dimension}
                    onChange={(e) => setNewUom({ ...newUom, dimension: e.target.value as any })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                  >
                    <option value="COUNT">Count</option>
                    <option value="WEIGHT">Weight</option>
                    <option value="LENGTH">Length</option>
                    <option value="VOLUME">Volume</option>
                    <option value="AREA">Area</option>
                    <option value="TIME">Time</option>
                    <option value="DATA">Data</option>
                    <option value="TEMPERATURE">Temperature</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowUomModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uomSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition disabled:opacity-50"
                >
                  {uomSubmitting ? 'Saving...' : 'Save Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PRICE LIST MODAL */}
      {showPriceListModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pricelist-modal-title"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h2 id="pricelist-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-400" />
                Create Price List
              </h2>
              <button onClick={() => setShowPriceListModal(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {priceListError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-lg">
                {priceListError}
              </div>
            )}

            <form onSubmit={handleCreatePriceList} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">Code *</label>
                <input
                  type="text"
                  required
                  value={newPriceList.code}
                  onChange={(e) => setNewPriceList({ ...newPriceList, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. GLOBAL-USD-2026"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-zinc-400 font-medium mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={newPriceList.name}
                  onChange={(e) => setNewPriceList({ ...newPriceList, name: e.target.value })}
                  placeholder="e.g. Global Standard Commercial Pricing"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-zinc-400 font-medium mb-1">Currency Code (ISO 4217) *</label>
                <input
                  type="text"
                  required
                  maxLength={3}
                  value={newPriceList.currencyCode}
                  onChange={(e) => setNewPriceList({ ...newPriceList, currencyCode: e.target.value.toUpperCase() })}
                  placeholder="USD"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono uppercase"
                />
              </div>

              <div className="flex gap-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={newPriceList.isTaxIncluded}
                    onChange={(e) => setNewPriceList({ ...newPriceList, isTaxIncluded: e.target.checked })}
                    className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  Tax Included
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={newPriceList.enforcePriceLimit}
                    onChange={(e) => setNewPriceList({ ...newPriceList, enforcePriceLimit: e.target.checked })}
                    className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  Enforce Limit
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowPriceListModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={priceListSubmitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition disabled:opacity-50"
                >
                  {priceListSubmitting ? 'Creating...' : 'Create Price List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
