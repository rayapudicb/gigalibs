'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  isFormFieldVisible,
  type FormFieldDefinition,
  type PublicFormResponse,
} from '@gigalibs/contracts';

interface PublicFormRendererProps {
  form: PublicFormResponse;
}

export function PublicFormRenderer({ form }: PublicFormRendererProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Restore draft from localStorage on mount
  useEffect(() => {
    const draftKey = `gigalibs_form_draft_${form.id}`;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        setFormData(JSON.parse(saved));
      }
    } catch {
      // Ignore local storage errors
    }
  }, [form.id]);

  // Save draft on changes
  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [fieldId]: value };
      try {
        localStorage.setItem(`gigalibs_form_draft_${form.id}`, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });

    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const fields = useMemo(() => {
    const astFields = (form.schemaAst?.fields as FormFieldDefinition[]) || [];
    return astFields.filter((field) => isFormFieldVisible(field, formData));
  }, [form.schemaAst, formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Validate visible fields
    const validationErrors: Record<string, string> = {};
    for (const field of fields) {
      if (field.validation?.required) {
        const val = formData[field.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          validationErrors[field.id] = field.validation.customErrorMessage || `${field.label} is required`;
        }
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const clientSubmissionId = `sub_${Date.now()}_${crypto.randomUUID()}`;
      const response = await fetch(`/api/forms/public/${form.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientSubmissionId,
          payload: formData,
          respondentEmail: formData['email'] || formData['respondent_email'],
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Submission failed (${response.status})`);
      }

      setIsSubmitted(true);
      try {
        localStorage.removeItem(`gigalibs_form_draft_${form.id}`);
      } catch {
        // Ignore
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit questionnaire. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Thank you!</h2>
        <p className="mt-2 text-sm text-slate-600">
          {form.schemaAst.successMessage || 'Your response has been securely recorded.'}
        </p>
        <button
          type="button"
          onClick={() => {
            setFormData({});
            setIsSubmitted(false);
          }}
          className="mt-6 inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
        >
          Submit another response
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Top Banner & Header */}
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-8 text-white sm:px-8">
        {form.tenantBranding?.name && (
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">
            {form.tenantBranding.name}
          </p>
        )}
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {form.title}
        </h1>
        {form.description && (
          <p className="mt-2 text-sm text-blue-50/90 leading-relaxed">
            {form.description}
          </p>
        )}
      </div>

      {submitError && (
        <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
          {submitError}
        </div>
      )}

      {/* Interactive Questionnaire Form */}
      <form onSubmit={handleSubmit} className="divide-y divide-slate-100 p-6 sm:p-8 space-y-6">
        {fields.map((field) => (
          <div key={field.id} className="pt-6 first:pt-0">
            <label className="block text-sm font-semibold text-slate-900">
              {field.label}
              {field.validation?.required && <span className="ml-1 text-rose-500">*</span>}
            </label>
            {field.helpText && (
              <p className="mt-0.5 text-xs text-slate-500">{field.helpText}</p>
            )}

            <div className="mt-2.5">
              {/* TEXT, EMAIL, PHONE, NUMBER */}
              {['TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'CURRENCY'].includes(field.type) && (
                <input
                  type={field.type === 'NUMBER' || field.type === 'CURRENCY' ? 'number' : field.type === 'EMAIL' ? 'email' : 'text'}
                  value={formData[field.id] || ''}
                  placeholder={field.placeholder || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-sm"
                />
              )}

              {/* TEXTAREA */}
              {field.type === 'TEXTAREA' && (
                <textarea
                  rows={3}
                  value={formData[field.id] || ''}
                  placeholder={field.placeholder || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-sm"
                />
              )}

              {/* SELECT */}
              {field.type === 'SELECT' && (
                <select
                  value={formData[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-sm"
                >
                  <option value="">{field.placeholder || '-- Select an option --'}</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {/* RADIO */}
              {field.type === 'RADIO' && (
                <div className="space-y-2 mt-2">
                  {(field.options || []).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name={field.id}
                        value={opt.value}
                        checked={formData[field.id] === opt.value}
                        onChange={() => handleFieldChange(field.id, opt.value)}
                        className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-600"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* CHECKBOX */}
              {field.type === 'CHECKBOX' && (
                <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={Boolean(formData[field.id])}
                    onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>{field.placeholder || 'Yes, I agree'}</span>
                </label>
              )}

              {/* DATE */}
              {field.type === 'DATE' && (
                <input
                  type="date"
                  value={formData[field.id] || ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-sm"
                />
              )}

              {/* STAR_RATING */}
              {field.type === 'STAR_RATING' && (
                <div className="flex items-center gap-2 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleFieldChange(field.id, star)}
                      className={`text-2xl transition ${
                        (formData[field.id] || 0) >= star ? 'text-amber-400 scale-110' : 'text-slate-300 hover:text-amber-200'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  {formData[field.id] && (
                    <span className="ml-2 text-xs font-semibold text-slate-600">
                      {formData[field.id]} / 5
                    </span>
                  )}
                </div>
              )}

              {/* NPS_SCORE */}
              {field.type === 'NPS_SCORE' && (
                <div className="mt-2">
                  <div className="grid grid-cols-11 gap-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => handleFieldChange(field.id, score)}
                        className={`rounded-lg py-2 text-xs font-bold transition border ${
                          formData[field.id] === score
                            ? 'bg-blue-600 text-white border-blue-600 shadow'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-slate-400 font-medium">
                    <span>Not likely</span>
                    <span>Extremely likely</span>
                  </div>
                </div>
              )}
            </div>

            {errors[field.id] && (
              <p className="mt-1.5 text-xs font-medium text-rose-600">
                {errors[field.id]}
              </p>
            )}
          </div>
        ))}

        <div className="pt-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 transition"
          >
            {isSubmitting ? 'Submitting response...' : form.submitButtonText || 'Submit Questionnaire'}
          </button>
        </div>
      </form>
    </div>
  );
}
