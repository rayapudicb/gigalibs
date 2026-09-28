import React from 'react';
import { notFound } from 'next/navigation';
import { formsEngineService } from '@/lib/forms-engine-service';
import { PublicFormRenderer } from '@/components/forms/PublicFormRenderer';

interface PublicFormPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PublicFormPageProps) {
  const { slug } = await params;
  const form = await formsEngineService.getPublicFormBySlug(slug);
  if (!form) return { title: 'Form Not Found' };

  return {
    title: `${form.title} | ${form.tenantBranding?.name || 'GigaLibs'}`,
    description: form.description || 'Public questionnaire powered by GigaLibs',
  };
}

export default async function PublicFormPage({ params }: PublicFormPageProps) {
  const { slug } = await params;
  const form = await formsEngineService.getPublicFormBySlug(slug);

  if (!form) {
    notFound();
  }

  return <PublicFormRenderer form={form} />;
}
