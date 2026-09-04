/**
 * @gigalibs/billing-react
 *
 * Billing and subscription UI components: PricingTable, PlanCard,
 * and SubscriptionBadge.
 *
 * @module
 */

import * as React from 'react';
import type { Plan } from '@gigalibs/contracts';

export interface PricingTableProps {
  plans: Plan[];
  currentPlanId?: string;
  onSelectPlan?: (planId: string) => void;
}

export const PricingTable: React.FC<PricingTableProps> = ({
  plans,
  currentPlanId,
  onSelectPlan,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto p-4">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        const priceDisplay = plan.price === 0 ? '$0' : `$${(plan.price / 100).toFixed(0)}`;

        return (
          <div
            key={plan.id}
            className={`rounded-2xl p-6 bg-white border flex flex-col justify-between transition-all ${
              isCurrent ? 'border-blue-600 ring-2 ring-blue-600 shadow-md' : 'border-slate-200 shadow-sm'
            }`}
          >
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                {isCurrent && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
                    Current Plan
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mb-6">{plan.description}</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-slate-900">{priceDisplay}</span>
                <span className="text-sm text-slate-500"> / {plan.interval}</span>
              </div>
              <ul className="space-y-2.5 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center text-sm text-slate-700 space-x-2">
                    <span className="text-blue-600 font-bold">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => onSelectPlan?.(plan.id)}
              disabled={isCurrent}
              className={`w-full h-11 rounded-xl font-medium text-sm transition-colors ${
                isCurrent
                  ? 'bg-slate-100 text-slate-400 cursor-default'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isCurrent ? 'Active' : 'Upgrade Plan'}
            </button>
          </div>
        );
      })}
    </div>
  );
};
