/**
 * @gigalibs/forms-engine-react
 *
 * React components and hooks for the universal runtime form system.
 *
 * - useFormDefinition(formKey, { tenantId }) — fetches live definition, 30s cache
 * - RuntimeForm — renders any form definition without hand-written field components
 *
 * @example
 *   import { useFormDefinition, RuntimeForm } from '@gigalibs/forms-engine-react';
 *
 *   function InvoiceForm({ tenantId }: { tenantId: string }) {
 *     const { definition, loading } = useFormDefinition('ar.invoice', { tenantId });
 *     if (loading || !definition) return <Spinner />;
 *     return <RuntimeForm definition={definition} onSubmit={handleSubmit} />;
 *   }
 *
 * @module
 */

export * from './use-form-definition.js';
export * from './runtime-form.js';
