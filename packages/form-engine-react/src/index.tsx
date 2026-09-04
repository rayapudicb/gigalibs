/**
 * @gigalibs/form-engine-react
 *
 * Enterprise Dynamic Form Builder, Live Runtime Renderer, and Submissions Grid (FormEngine.io grade).
 *
 * @module
 */

import * as React from 'react';
import {
  FormEngine,
  type FormSchema,
  type FormFieldDefinition,
  type FormSubmission,
} from '@gigalibs/form-engine-core';
import { ExportEngine } from '@gigalibs/export-engine-core';

export interface DynamicFormStudioProps {
  initialSchema?: FormSchema;
  onSaveSchema?: (schema: FormSchema) => void;
}

export const DynamicFormStudio: React.FC<DynamicFormStudioProps> = ({
  initialSchema,
  onSaveSchema,
}) => {
  const [activeTab, setActiveTab] = React.useState<'builder' | 'preview' | 'submissions' | 'sql'>('preview');

  // Form Schema State
  const [schema, setSchema] = React.useState<FormSchema>(
    initialSchema || {
      id: 'form_onboarding_2026',
      tenantId: 'acme',
      title: 'Enterprise Customer Onboarding & Cloud Provisioning Questionnaire',
      description: 'Fill out your organization details to configure your dedicated cluster and billing terms.',
      version: 1,
      submitButtonText: 'Submit Provisioning Request 🚀',
      successMessage: 'Thank you! Your dedicated workspace configuration request has been recorded.',
      createdAt: '2026-08-30',
      fields: [
        {
          id: 'org_name',
          name: 'organizationName',
          label: 'Organization / Company Name',
          type: 'TEXT',
          placeholder: 'Acme Corporation',
          validation: { required: true },
        },
        {
          id: 'admin_email',
          name: 'adminEmail',
          label: 'Primary Admin Work Email',
          type: 'EMAIL',
          placeholder: 'admin@acme.com',
          validation: { required: true },
        },
        {
          id: 'account_tier',
          name: 'accountTier',
          label: 'Selected SaaS Infrastructure Tier',
          type: 'SELECT',
          defaultValue: 'GROWTH',
          options: [
            { label: 'Starter Cloud ($29/mo)', value: 'STARTER' },
            { label: 'Growth Enterprise ($99/mo)', value: 'GROWTH' },
            { label: 'Dedicated Enterprise ($299/mo)', value: 'ENTERPRISE' },
          ],
          validation: { required: true },
        },
        {
          id: 'db_region',
          name: 'dbRegion',
          label: 'Dedicated Database AWS / Cloud Region',
          type: 'SELECT',
          defaultValue: 'US_EAST_1',
          options: [
            { label: 'US-East (N. Virginia)', value: 'US_EAST_1' },
            { label: 'EU-Central (Frankfurt)', value: 'EU_CENTRAL_1' },
            { label: 'AP-Southeast (Singapore)', value: 'AP_SOUTHEAST_1' },
          ],
          conditions: [
            {
              dependsOnFieldId: 'account_tier',
              operator: 'EQUALS',
              value: 'ENTERPRISE',
              action: 'SHOW',
            },
          ],
          helpText: 'Conditionally displayed only when Dedicated Enterprise tier is selected.',
        },
        {
          id: 'expected_seats',
          name: 'expectedSeats',
          label: 'Estimated User Seats Needed',
          type: 'NUMBER',
          placeholder: '25',
          validation: { required: true, min: 1, max: 1000 },
        },
        {
          id: 'sla_rating',
          name: 'slaRating',
          label: 'Required SLA Target Rating (1 to 5 Stars)',
          type: 'RATING',
          defaultValue: 5,
        },
        {
          id: 'custom_notes',
          name: 'customNotes',
          label: 'Special Compliance or VPC Peering Requirements',
          type: 'TEXTAREA',
          placeholder: 'Mention any HIPAA, SOC2 Type II, or BYOK requirements...',
        },
      ],
    },
  );

  // Live Runtime Form Data & Submissions
  const [formData, setFormData] = React.useState<Record<string, any>>({
    org_name: 'Tesla Motors Cloud Division',
    admin_email: 'infrastructure@tesla.com',
    account_tier: 'ENTERPRISE',
    db_region: 'US_EAST_1',
    expected_seats: 150,
    sla_rating: 5,
    customNotes: 'Require isolated PostgreSQL instance and SOC2 audit logs.',
  });

  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});
  const [submissionSuccess, setSubmissionSuccess] = React.useState(false);

  const [submissions, setSubmissions] = React.useState<FormSubmission[]>([
    {
      id: 'sub_101',
      formId: 'form_onboarding_2026',
      tenantId: 'acme',
      submittedBy: 'infrastructure@tesla.com',
      ipAddress: '198.51.100.82',
      submittedAt: '2026-08-30 12:30:15',
      data: {
        org_name: 'Tesla Motors Cloud Division',
        admin_email: 'infrastructure@tesla.com',
        account_tier: 'ENTERPRISE',
        db_region: 'US_EAST_1',
        expected_seats: 150,
        sla_rating: 5,
      },
    },
    {
      id: 'sub_102',
      formId: 'form_onboarding_2026',
      tenantId: 'acme',
      submittedBy: 'dev@stripe-eu.com',
      ipAddress: '192.0.2.44',
      submittedAt: '2026-08-30 13:10:00',
      data: {
        org_name: 'Stripe Payments EU',
        admin_email: 'dev@stripe-eu.com',
        account_tier: 'GROWTH',
        expected_seats: 25,
        sla_rating: 4,
      },
    },
  ]);

  const handleFieldChange = (fieldId: string, val: any) => {
    const nextData = { ...formData, [fieldId]: val };
    setFormData(nextData);

    if (formErrors[fieldId]) {
      const nextErrors = { ...formErrors };
      delete nextErrors[fieldId];
      setFormErrors(nextErrors);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = FormEngine.validate(schema, formData);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    const newSub: FormSubmission = {
      id: `sub_${Date.now()}`,
      formId: schema.id,
      tenantId: schema.tenantId,
      submittedBy: formData.admin_email || 'anonymous',
      ipAddress: '198.51.100.82',
      submittedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      data: { ...formData },
    };

    setSubmissions([newSub, ...submissions]);
    setSubmissionSuccess(true);
    setTimeout(() => setSubmissionSuccess(false), 4000);
  };

  const handleAddField = () => {
    const newField: FormFieldDefinition = {
      id: `field_${Date.now()}`,
      name: `customField_${schema.fields.length + 1}`,
      label: 'New Dynamic Question',
      type: 'TEXT',
      placeholder: 'Enter answer...',
      validation: { required: false },
    };
    setSchema({ ...schema, fields: [...schema.fields, newField] });
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Studio Header & Navigation Tabs */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-slate-900">{schema.title}</h3>
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
              v{schema.version}.0
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{schema.description}</p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-xs">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            👁️ Live Form Runtime
          </button>
          <button
            onClick={() => setActiveTab('builder')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'builder' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🛠️ Schema Builder
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'submissions' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📥 Submissions ({submissions.length})
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'sql' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🗄️ Postgres Schema
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE FORM RUNTIME (PREVIEW) */}
      {activeTab === 'preview' && (
        <div className="p-8 max-w-2xl mx-auto w-full space-y-6">
          {submissionSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center space-x-2">
              <span>✓</span>
              <span>{schema.successMessage}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-5">
            {schema.fields.map((field) => {
              const isVisible = FormEngine.isFieldVisible(field, formData);
              if (!isVisible) return null;

              const val = formData[field.id] ?? '';
              const error = formErrors[field.id];

              return (
                <div key={field.id} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-800">
                      {field.label} {field.validation?.required && <span className="text-rose-600">*</span>}
                    </label>
                    {field.conditions && field.conditions.length > 0 && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-mono">
                        Conditional Field ⚡
                      </span>
                    )}
                  </div>

                  {/* Field Renders by Type */}
                  {field.type === 'TEXT' && (
                    <input
                      type="text"
                      placeholder={field.placeholder}
                      value={val}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full h-10 px-3 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 focus:border-blue-500"
                    />
                  )}

                  {field.type === 'EMAIL' && (
                    <input
                      type="email"
                      placeholder={field.placeholder}
                      value={val}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full h-10 px-3 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 focus:border-blue-500"
                    />
                  )}

                  {field.type === 'NUMBER' && (
                    <input
                      type="number"
                      placeholder={field.placeholder}
                      value={val}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full h-10 px-3 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 focus:border-blue-500"
                    />
                  )}

                  {field.type === 'SELECT' && (
                    <select
                      value={val}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full h-10 px-3 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 focus:border-blue-500"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === 'TEXTAREA' && (
                    <textarea
                      rows={3}
                      placeholder={field.placeholder}
                      value={val}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 focus:border-blue-500"
                    />
                  )}

                  {field.type === 'RATING' && (
                    <div className="flex space-x-2 pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => handleFieldChange(field.id, star)}
                          className={`text-xl transition-transform hover:scale-125 ${
                            Number(val) >= star ? 'text-amber-400' : 'text-slate-300'
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  )}

                  {field.helpText && <p className="text-[11px] text-slate-400">{field.helpText}</p>}
                  {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
                </div>
              );
            })}

            <button
              type="submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors"
            >
              {schema.submitButtonText}
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: SCHEMA BUILDER CANVAS */}
      {activeTab === 'builder' && (
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Form Field Schema Configuration</h4>
            <button
              onClick={handleAddField}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-blue-700"
            >
              + Add Field
            </button>
          </div>

          <div className="space-y-3">
            {schema.fields.map((f, idx) => (
              <div key={f.id} className="p-4 bg-slate-50 border rounded-xl flex flex-wrap justify-between items-center gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                    <span className="text-xs font-bold text-slate-900">{f.label}</span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono font-bold">
                      {f.type}
                    </span>
                    {f.validation?.required && (
                      <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                        REQUIRED
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">Field ID: {f.id}</div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const updated = schema.fields.filter((field) => field.id !== f.id);
                      setSchema({ ...schema, fields: updated });
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SUBMISSIONS DATA GRID */}
      {activeTab === 'submissions' && (
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Postgres JSONB Submissions ({submissions.length})
            </h4>
            <div className="space-x-2">
              <button
                onClick={() =>
                  ExportEngine.exportToExcelXml(
                    submissions.map((s) => ({
                      id: s.id,
                      submittedBy: s.submittedBy,
                      submittedAt: s.submittedAt,
                      ipAddress: s.ipAddress,
                      orgName: s.data.org_name,
                      tier: s.data.account_tier,
                      seats: s.data.expected_seats,
                    })),
                    [
                      { key: 'id', header: 'Submission ID' },
                      { key: 'submittedBy', header: 'Submitted By' },
                      { key: 'submittedAt', header: 'Submitted At' },
                      { key: 'orgName', header: 'Organization' },
                      { key: 'tier', header: 'Selected Tier' },
                      { key: 'seats', header: 'Seats' },
                    ],
                    'Form_Submissions_Export.xlsx',
                  )
                }
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-emerald-700"
              >
                📊 Export to Excel (.xlsx)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-3">Submission ID</th>
                  <th className="p-3">Submitted By / IP</th>
                  <th className="p-3">Captured Data (JSONB)</th>
                  <th className="p-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 font-mono font-bold text-blue-600">{s.id}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{s.submittedBy}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{s.ipAddress}</div>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-700">
                      <div className="p-2 bg-slate-100 rounded-lg max-w-md overflow-x-auto">
                        {JSON.stringify(s.data)}
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">{s.submittedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: POSTGRESQL DDL SCHEMA */}
      {activeTab === 'sql' && (
        <div className="p-6 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              PostgreSQL Relational Storage Schema (JSONB & GIN Indexed)
            </h4>
            <span className="text-xs text-emerald-600 font-bold font-mono">✓ Multi-Tenant Ready</span>
          </div>
          <pre className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto leading-relaxed">
            {FormEngine.generatePostgresDdl()}
          </pre>
        </div>
      )}
    </div>
  );
};
