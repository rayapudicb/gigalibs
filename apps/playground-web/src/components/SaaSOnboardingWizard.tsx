import * as React from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Input,
} from '@gigalibs/ui';
import { STANDARD_SAAS_PLANS } from './GenericSubscriptionStudio.js';
import { MultiCurrencyEngine } from '@gigalibs/multi-currency';

export interface SaaSOnboardingWizardProps {
  invitationToken?: string;
  invitedEmail?: string;
  invitedOrgName?: string;
  onComplete?: (tenantData: any) => void;
}

export function SaaSOnboardingWizard({
  invitationToken,
  invitedEmail,
  invitedOrgName,
  onComplete,
}: SaaSOnboardingWizardProps) {
  // Step Navigation (1 to 5)
  const [currentStep, setCurrentStep] = React.useState<number>(1);

  // Step 1: User Identity & Credentials
  const [fullName, setFullName] = React.useState(invitedOrgName ? 'Alex Rivera (Lead Engineer)' : '');
  const [email, setEmail] = React.useState(invitedEmail || '');
  const [password, setPassword] = React.useState('');
  const [isInvitation] = React.useState(!!invitationToken || !!invitedEmail);

  // Step 2: Organization & Workspace Identity
  const [orgName, setOrgName] = React.useState(invitedOrgName || 'Warner Bros Discovery Operations');
  const [workspaceSlug, setWorkspaceSlug] = React.useState('warner-ops');
  const [companySize, setCompanySize] = React.useState('50-250');
  const [industrySector, setIndustrySector] = React.useState('🎬 Media & Entertainment');

  // Step 3: Plan & Subscription Selection
  const [selectedPlanId, setSelectedPlanId] = React.useState<string>(STANDARD_SAAS_PLANS[1]!.id); // Growth Pro
  const [billingInterval, setBillingInterval] = React.useState<'month' | 'year'>('month');

  // Step 4: Team Member Invitations
  const [inviteEmails, setInviteEmails] = React.useState<string[]>([
    'cfo@wbd.com',
    'director-photography@wbd.com',
  ]);
  const [newInviteEmail, setNewInviteEmail] = React.useState('');

  // Step 5: Live Provisioning Simulation
  const [provisioningStatus, setProvisioningStatus] = React.useState<string>('INITIALIZING');
  const [provisioningLogs, setProvisioningLogs] = React.useState<string[]>([]);

  // Step validation
  const canProceedStep1 = fullName.trim().length > 1 && email.includes('@') && password.length >= 6;
  const canProceedStep2 = orgName.trim().length > 1 && workspaceSlug.trim().length > 1;

  const handleAddInviteEmail = () => {
    if (newInviteEmail.includes('@') && !inviteEmails.includes(newInviteEmail)) {
      setInviteEmails([...inviteEmails, newInviteEmail.trim()]);
      setNewInviteEmail('');
    }
  };

  const handleRemoveInviteEmail = (idx: number) => {
    setInviteEmails(inviteEmails.filter((_, i) => i !== idx));
  };

  // Launch Provisioning on Step 5
  const handleStartProvisioning = () => {
    setCurrentStep(5);
    setProvisioningStatus('RUNNING');
    setProvisioningLogs([
      '⚡ [1/5] Validating credentials and cryptographic identity keys...',
    ]);

    setTimeout(() => {
      setProvisioningLogs((prev) => [
        ...prev,
        `🏢 [2/5] Allocating isolated tenant workspace '${workspaceSlug}.gigalibs.dev'...`,
      ]);
    }, 600);

    setTimeout(() => {
      setProvisioningLogs((prev) => [
        ...prev,
        `📦 [3/5] Binding Generic Subscription (${selectedPlanId.toUpperCase()}) & Entitlements...`,
      ]);
    }, 1200);

    setTimeout(() => {
      setProvisioningLogs((prev) => [
        ...prev,
        '📒 [4/5] Seeding double-entry Chart of Accounts, Tax Nexus rules & RBAC permissions...',
      ]);
    }, 1800);

    setTimeout(() => {
      setProvisioningLogs((prev) => [
        ...prev,
        '🚀 [5/5] Tenant workspace live! Launching enterprise dashboard...',
      ]);
      setProvisioningStatus('COMPLETE');
    }, 2400);
  };

  const handleFinishOnboarding = () => {
    if (onComplete) {
      onComplete({
        orgName,
        workspaceSlug,
        email,
        fullName,
        planId: selectedPlanId,
      });
    } else {
      alert(`🎉 Welcome to ${orgName}! Redirecting to dashboard.`);
      window.location.href = '?tab=overview';
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Top Banner if Invitation */}
      {isInvitation && (
        <div className="p-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl border border-indigo-700 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💌</span>
            <div>
              <div className="font-bold text-sm">Platform Admin Invitation Received</div>
              <div className="text-xs text-indigo-200">
                You have been invited by platform administrators to join <strong>{orgName}</strong> with full admin rights.
              </div>
            </div>
          </div>
          <Badge variant="success">INVITATION VERIFIED</Badge>
        </div>
      )}

      {/* Progressive Step Tracker Indicator */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          {[
            { step: 1, title: '1. Identity & Auth', icon: '👤' },
            { step: 2, title: '2. Organization', icon: '🏢' },
            { step: 3, title: '3. Plan & Billing', icon: '📦' },
            { step: 4, title: '4. Team Invites', icon: '👥' },
            { step: 5, title: '5. Provisioning', icon: '🚀' },
          ].map((s) => (
            <div
              key={s.step}
              className={`flex items-center gap-2 text-xs font-bold ${
                currentStep === s.step
                  ? 'text-indigo-600'
                  : currentStep > s.step
                  ? 'text-emerald-600'
                  : 'text-slate-400'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition ${
                  currentStep === s.step
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : currentStep > s.step
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {currentStep > s.step ? '✓' : s.step}
              </div>
              <span className="hidden sm:inline">{s.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 1: IDENTITY & CREDENTIALS
          ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 1 && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4 border-b">
            <CardTitle className="text-base font-bold text-slate-900">👤 Step 1: Administrator Identity & Authentication</CardTitle>
            <p className="text-xs text-slate-500">Create your administrative account credentials or confirm your invitation details.</p>
          </CardHeader>
          <CardContent className="p-0 pt-6 space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700">Full Legal Name *</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sarah Connor"
                className="mt-1"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">Corporate Email Address *</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah.connor@enterprise.com"
                className="mt-1"
                disabled={isInvitation}
              />
              {isInvitation && <span className="text-[10px] text-slate-400 mt-0.5 block">Locked to verified invitation email</span>}
            </div>
            <div>
              <label className="font-bold text-slate-700">Secure Password (min. 6 characters) *</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1"
              />
            </div>

            <div className="border-t pt-4 flex justify-end">
              <Button
                size="sm"
                disabled={!canProceedStep1}
                onClick={() => setCurrentStep(2)}
                className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold"
              >
                Continue to Organization Setup →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 2: ORGANIZATION IDENTITY & CUSTOM DOMAIN SLUG
          ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 2 && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4 border-b">
            <CardTitle className="text-base font-bold text-slate-900">🏢 Step 2: Organization & Workspace Identity</CardTitle>
            <p className="text-xs text-slate-500">Configure your isolated tenant workspace slug and company classification.</p>
          </CardHeader>
          <CardContent className="p-0 pt-6 space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700">Organization / Legal Company Name *</label>
              <Input
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                }}
                placeholder="e.g. Warner Bros Discovery Operations"
                className="mt-1"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Isolated Workspace Subdomain Slug *</label>
              <div className="flex items-center gap-1 mt-1">
                <Input
                  value={workspaceSlug}
                  onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="font-mono"
                />
                <span className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono text-xs font-bold">
                  .gigalibs.dev
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700">Company Size</label>
                <select
                  value={companySize}
                  onChange={(e) => setCompanySize(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 mt-1"
                >
                  <option value="1-10">1 - 10 Employees (Seed / Early)</option>
                  <option value="10-50">10 - 50 Employees (Growth)</option>
                  <option value="50-250">50 - 250 Employees (Mid-Market)</option>
                  <option value="250+">250+ Employees (Global Enterprise)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700">Industry Sector</label>
                <select
                  value={industrySector}
                  onChange={(e) => setIndustrySector(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 mt-1"
                >
                  <option value="🎬 Media & Entertainment">🎬 Media & Entertainment</option>
                  <option value="💻 B2B SaaS & Cloud">💻 B2B SaaS & Cloud</option>
                  <option value="🏦 FinTech & Banking">🏦 FinTech & Banking</option>
                  <option value="🏥 Healthcare & Life Sciences">🏥 Healthcare & Life Sciences</option>
                  <option value="🛒 E-Commerce & Retail">🛒 E-Commerce & Retail</option>
                </select>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-between">
              <Button size="sm" variant="outline" onClick={() => setCurrentStep(1)}>← Back</Button>
              <Button
                size="sm"
                disabled={!canProceedStep2}
                onClick={() => setCurrentStep(3)}
                className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold"
              >
                Continue to Plan Selection →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 3: PLAN & SUBSCRIPTION SELECTION
          ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <Card className="p-6">
            <CardHeader className="p-0 pb-4 border-b flex justify-between items-center">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">📦 Step 3: Choose Subscription Plan & Billing Cadence</CardTitle>
                <p className="text-xs text-slate-500">Every plan includes 14-day free trial. You can upgrade, downgrade or cancel anytime.</p>
              </div>

              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setBillingInterval('month')}
                  className={`px-3 py-1 rounded-lg ${billingInterval === 'month' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600'}`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval('year')}
                  className={`px-3 py-1 rounded-lg flex items-center gap-1 ${billingInterval === 'year' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600'}`}
                >
                  <span>Annual</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black">20% OFF</span>
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-0 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {STANDARD_SAAS_PLANS.map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  const price = billingInterval === 'year' ? Math.round(plan.annualPriceCents / 12) : plan.monthlyPriceCents;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/20 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          <h4 className="font-black text-slate-900 text-sm">{plan.name}</h4>
                          {isSelected && <Badge variant="info">SELECTED</Badge>}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">{plan.description}</p>
                        <div className="mt-3 text-2xl font-black text-slate-900 font-sans">
                          {MultiCurrencyEngine.format(price, plan.currency)} <span className="text-xs font-normal text-slate-400">/ mo</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t text-[11px] space-y-1">
                        {Object.values(plan.entitlements).slice(0, 3).map((e) => (
                          <div key={e.featureKey} className="text-slate-600 flex items-center gap-1">
                            <span>✓</span>
                            <span>{e.featureName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-4 mt-6 flex justify-between">
                <Button size="sm" variant="outline" onClick={() => setCurrentStep(2)}>← Back</Button>
                <Button
                  size="sm"
                  onClick={() => setCurrentStep(4)}
                  className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold"
                >
                  Continue to Team Invites →
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 4: TEAM MEMBER INVITATIONS
          ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 4 && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4 border-b">
            <CardTitle className="text-base font-bold text-slate-900">👥 Step 4: Invite Team Members & Colleagues (Optional)</CardTitle>
            <p className="text-xs text-slate-500">Add team members now to automatically dispatch invitation links with role permissions.</p>
          </CardHeader>
          <CardContent className="p-0 pt-6 space-y-4 text-xs">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={newInviteEmail}
                onChange={(e) => setNewInviteEmail(e.target.value)}
              />
              <Button size="sm" onClick={handleAddInviteEmail} className="!bg-indigo-600 !text-white font-bold whitespace-nowrap">
                + Add Member
              </Button>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-slate-700 block">Invited Team ({inviteEmails.length}):</label>
              {inviteEmails.map((em, idx) => (
                <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border flex justify-between items-center font-mono">
                  <span>{em}</span>
                  <button type="button" onClick={() => handleRemoveInviteEmail(idx)} className="text-rose-500 font-bold hover:text-rose-700">✕</button>
                </div>
              ))}
            </div>

            <div className="border-t pt-4 flex justify-between">
              <Button size="sm" variant="outline" onClick={() => setCurrentStep(3)}>← Back</Button>
              <Button
                size="sm"
                onClick={handleStartProvisioning}
                className="!bg-emerald-600 hover:!bg-emerald-500 !text-white font-bold shadow-sm"
              >
                Provision Workspace & Launch 🚀
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          STEP 5: AUTOMATED PROVISIONING & LAUNCH
          ──────────────────────────────────────────────────────────────────────── */}
      {currentStep === 5 && (
        <Card className="p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-indigo-600 text-white flex items-center justify-center text-3xl mx-auto shadow-lg animate-pulse">
            ⚡
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">
              {provisioningStatus === 'COMPLETE' ? '🎉 Workspace Provisioning Complete!' : '⚙️ Provisioning Enterprise Workspace...'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {orgName} on <strong>{workspaceSlug}.gigalibs.dev</strong>
            </p>
          </div>

          <div className="p-4 bg-slate-950 text-indigo-300 font-mono text-left text-xs rounded-2xl max-w-lg mx-auto space-y-1.5 shadow-inner">
            {provisioningLogs.map((log, idx) => (
              <div key={idx} className="leading-relaxed">{log}</div>
            ))}
          </div>

          {provisioningStatus === 'COMPLETE' && (
            <div className="pt-2">
              <Button
                size="lg"
                onClick={handleFinishOnboarding}
                className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold px-8 shadow-md"
              >
                Enter {orgName} Dashboard 🚀
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
