'use client';

import React, { useState } from 'react';

interface StatutoryPolicy {
  code: string;
  name: string;
  region: string;
  currency: string;
  weeklyOtHours: number;
  dailyOtHours: number | null;
  doubleTimeHours: number | null;
  otMultiplier: number;
  dtMultiplier: number | null;
  mealBreakMinutes: number;
  mealBreakThresholdHours: number;
  mealPenaltyPayHours: number;
  nightShiftPremiumPercent: number;
  keyRequirements: string[];
}

export function RulesSection() {
  const [selectedRegime, setSelectedRegime] = useState<string>('JP-36');

  const policies: Record<string, StatutoryPolicy> = {
    'JP-36': {
      code: 'JP-36',
      name: 'Japan Labor Standards Act: Article 36 Agreement (36協定)',
      region: 'Japan (全国)',
      currency: 'JPY (¥)',
      weeklyOtHours: 40,
      dailyOtHours: 8,
      doubleTimeHours: null,
      otMultiplier: 1.25,
      dtMultiplier: null,
      mealBreakMinutes: 45,
      mealBreakThresholdHours: 6,
      mealPenaltyPayHours: 0,
      nightShiftPremiumPercent: 25, // 22:00 to 05:00
      keyRequirements: [
        'Strict statutory cap: 45 hours overtime per month, 360 hours per year (2024 Reform Law).',
        'Night-time work (深夜業 22:00–05:00) mandates +25% premium wage.',
        'Overtime extending into night hours incurs compounded +50% rate (1.50x).',
        'Mandatory Sagyōin Meibo (作業員名簿) safety and social insurance roster for metro track access.',
      ],
    },
    'US-CA': {
      code: 'US-CA',
      name: 'California Labor Code & IWC Wage Orders (AB5 Compliant)',
      region: 'California, USA',
      currency: 'USD ($)',
      weeklyOtHours: 40,
      dailyOtHours: 8,
      doubleTimeHours: 12,
      otMultiplier: 1.5,
      dtMultiplier: 2.0,
      mealBreakMinutes: 30,
      mealBreakThresholdHours: 5,
      mealPenaltyPayHours: 1.0,
      nightShiftPremiumPercent: 0,
      keyRequirements: [
        'Daily Overtime: 1.5x after 8 hours in a single workday.',
        'Double Time: 2.0x after 12 hours in a workday, or after 8 hours on the 7th consecutive day.',
        'Mandatory 30-min unpaid meal break before the end of the 5th hour.',
        'Missed meal break penalty: Employer must pay 1 full hour of regular pay to the worker.',
      ],
    },
    'US-FLSA': {
      code: 'US-FLSA',
      name: 'Fair Labor Standards Act (Standard Federal Regime)',
      region: 'United States (Federal)',
      currency: 'USD ($)',
      weeklyOtHours: 40,
      dailyOtHours: null,
      doubleTimeHours: null,
      otMultiplier: 1.5,
      dtMultiplier: null,
      mealBreakMinutes: 30,
      mealBreakThresholdHours: 6,
      mealPenaltyPayHours: 0,
      nightShiftPremiumPercent: 0,
      keyRequirements: [
        'Overtime at 1.5x regular rate for hours exceeding 40 in a statutory 7-day workweek.',
        'No mandatory daily overtime unless required by local collective bargaining agreement.',
        'Davis-Bacon Act (DBRA): Mandatory prevailing wage determination and fringe unbundling.',
      ],
    },
    'IN-FA': {
      code: 'IN-FA',
      name: 'India Factories Act & AP Minimum Wages Scheduled Employment',
      region: 'Andhra Pradesh & Pan-India',
      currency: 'INR (₹)',
      weeklyOtHours: 48,
      dailyOtHours: 9,
      doubleTimeHours: null,
      otMultiplier: 2.0,
      dtMultiplier: null,
      mealBreakMinutes: 30,
      mealBreakThresholdHours: 5,
      mealPenaltyPayHours: 0,
      nightShiftPremiumPercent: 0,
      keyRequirements: [
        'Overtime rate is strictly 2.0x ordinary rate of wages (Section 59, Factories Act).',
        'Daily maximum work limit: 9 hours; Weekly maximum: 48 hours.',
        '1% Building and Other Construction Workers (BOCW) welfare cess deduction.',
        'Summer heatwave advisory split shifts (avoiding 11:30 AM to 3:30 PM peak sun).',
      ],
    },
    'UK-WTD': {
      code: 'UK-WTD',
      name: 'UK Working Time Regulations (WTD & National Minimum Wage)',
      region: 'United Kingdom',
      currency: 'GBP (£)',
      weeklyOtHours: 48,
      dailyOtHours: null,
      doubleTimeHours: null,
      otMultiplier: 1.5,
      dtMultiplier: null,
      mealBreakMinutes: 20,
      mealBreakThresholdHours: 6,
      mealPenaltyPayHours: 0,
      nightShiftPremiumPercent: 15,
      keyRequirements: [
        '48-hour average weekly limit over 17-week reference period (opt-out tracking supported).',
        '11 consecutive hours of daily rest between shifts.',
        'IR35 off-payroll working status determination for contractors.',
      ],
    },
  };

  const active = policies[selectedRegime] || policies['JP-36'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-foreground">
            Statutory Jurisdiction & Overtime Policy Engine
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deterministic labor compliance rule sets: Article 36 caps, California daily double time, India 2.0x overtime, and mandatory meal break penalties.
          </p>
        </div>

        {/* Policy Selector Pills */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-muted rounded-lg self-start sm:self-auto">
          {Object.values(policies).map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => setSelectedRegime(p.code)}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${
                selectedRegime === p.code
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.region.split(' ')[0]} ({p.currency.split(' ')[0]})
            </button>
          ))}
        </div>
      </div>

      {/* Main Policy Card */}
      <div className="p-6 rounded-2xl border bg-card text-card-foreground shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
          <div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
              {active.code} Regulatory Policy Set
            </span>
            <h4 className="text-base font-bold text-foreground mt-1">{active.name}</h4>
            <p className="text-xs text-muted-foreground">Applicable Jurisdiction: {active.region}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Default Currency</div>
              <div className="font-mono font-black text-sm text-foreground">{active.currency}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">OT Multiplier</div>
              <div className="font-mono font-black text-sm text-emerald-600">{active.otMultiplier}x Base</div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl border bg-muted/30">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">Weekly Overtime Cap</div>
            <div className="text-lg font-black text-foreground mt-1">{active.weeklyOtHours} hours / week</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Threshold for 1.5x OT</div>
          </div>

          <div className="p-3.5 rounded-xl border bg-muted/30">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">Daily Overtime Threshold</div>
            <div className="text-lg font-black text-foreground mt-1">
              {active.dailyOtHours ? `${active.dailyOtHours} hours / day` : 'Not mandated'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {active.dailyOtHours ? `${active.otMultiplier}x applied after ${active.dailyOtHours}h` : 'Federal weekly threshold only'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border bg-muted/30">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">Double Time (2.0x)</div>
            <div className="text-lg font-black text-foreground mt-1">
              {active.doubleTimeHours ? `After ${active.doubleTimeHours}h` : active.dtMultiplier ? '2.0x Base' : 'None'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {active.doubleTimeHours ? '2.0x rate applied automatically' : 'Standard OT rules apply'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border bg-muted/30">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">Night Shift Premium</div>
            <div className="text-lg font-black text-foreground mt-1">
              {active.nightShiftPremiumPercent > 0 ? `+${active.nightShiftPremiumPercent}%` : 'Standard Rate'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {active.nightShiftPremiumPercent > 0 ? 'Mandatory 22:00–05:00 window' : 'Daytime shift parity'}
            </div>
          </div>
        </div>

        {/* Meal Break & Rest Mandates */}
        <div className="p-4 rounded-xl border bg-muted/20 space-y-2">
          <h5 className="font-bold text-xs uppercase tracking-wide text-foreground">
            Meal Break & Operational Rest Mandate
          </h5>
          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Mandatory Break:</span>{' '}
              <strong className="text-foreground">{active.mealBreakMinutes} minutes</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Trigger Threshold:</span>{' '}
              <strong className="text-foreground">Before {active.mealBreakThresholdHours}th hour worked</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Missed Break Penalty:</span>{' '}
              <strong className={active.mealPenaltyPayHours > 0 ? 'text-red-600 font-bold' : 'text-foreground'}>
                {active.mealPenaltyPayHours > 0 ? `+${active.mealPenaltyPayHours}h Regular Pay Penalty` : 'Standard clock out'}
              </strong>
            </div>
          </div>
        </div>

        {/* Key Statutory Directives Checklist */}
        <div className="space-y-2">
          <h5 className="font-bold text-xs uppercase tracking-wide text-foreground">
            Statutory Directives & Audit Enforcements
          </h5>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {active.keyRequirements.map((req, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span className="text-foreground">{req}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
