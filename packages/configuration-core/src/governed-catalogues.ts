import type { CountryPackV1, IndustryPackV1, MetricCatalogueV1 } from '@gigalibs/contracts';

// WI-OI-064c: platform-shipped governed catalogues. A tenant installs one as a Configuration Studio change set,
// then approves, publishes and activates it. Converted from the modules/gigaops prototype packs (now superseded),
// with place levels, synthetic demo profiles, time zones and ISO 3166-2 subdivisions added; Japan is new.
// Demo profile amounts are synthetic shape parameters for Demo Lab tenants only, never benchmarks.

export interface BundledMetricCatalogue {
  readonly key: string;
  readonly title: string;
  readonly catalogue: MetricCatalogueV1;
}

export const BUNDLED_METRIC_CATALOGUES: readonly BundledMetricCatalogue[] = [
  {
    "key": "operations",
    "title": "Operations metrics",
    "catalogue": {
      "metrics": [
        {
          "kind": "AGGREGATE",
          "key": "labour_hours",
          "label": "Labour hours",
          "unit": "HOURS",
          "factType": "LABOUR_HOURS",
          "aggregate": "SUM"
        },
        {
          "kind": "AGGREGATE",
          "key": "labour_cost",
          "label": "Labour cost",
          "unit": "CURRENCY",
          "factType": "LABOUR_COST",
          "aggregate": "SUM"
        },
        {
          "kind": "AGGREGATE",
          "key": "spend",
          "label": "Spend",
          "unit": "CURRENCY",
          "factType": "SPEND",
          "aggregate": "SUM"
        },
        {
          "kind": "AGGREGATE",
          "key": "downtime_minutes",
          "label": "Downtime",
          "unit": "MINUTES",
          "factType": "DOWNTIME_MINUTES",
          "aggregate": "SUM"
        },
        {
          "kind": "AGGREGATE",
          "key": "carbon_kg",
          "label": "Carbon",
          "unit": "KG",
          "factType": "CARBON_KG",
          "aggregate": "SUM"
        },
        {
          "kind": "RATIO",
          "key": "cost_per_labour_hour",
          "label": "Cost per labour hour",
          "unit": "CURRENCY",
          "numerator": "labour_cost",
          "denominator": "labour_hours"
        },
        {
          "kind": "RATIO",
          "key": "carbon_per_labour_hour",
          "label": "Carbon per labour hour",
          "unit": "KG",
          "numerator": "carbon_kg",
          "denominator": "labour_hours"
        }
      ]
    }
  }
];

export const BUNDLED_INDUSTRY_PACKS: readonly IndustryPackV1[] = [
  {
    "slug": "construction",
    "label": "Construction & Infrastructure",
    "emoji": "🏗️",
    "terminology": {
      "workUnit": "Project",
      "role": "Phase",
      "position": "Role",
      "worker": "Tradesperson",
      "agreement": "Subcontract"
    },
    "roleLabels": {
      "workforce_manager": "Project Superintendent",
      "ops_supervisor": "Site Foreman",
      "time_approver": "General Foreman"
    },
    "classificationLabels": {
      "W2": "Company Journeyman",
      "UNION_W2": "Union Trade Hand",
      "CONTRACTOR": "Trade Subcontractor",
      "TPV": "Equipment Vendor"
    },
    "requiredCertifications": [
      {
        "slug": "osha-30",
        "label": "OSHA-30 Construction",
        "required": true
      },
      {
        "slug": "hivis-ppe",
        "label": "PPE & Hardhat Verification",
        "required": true
      },
      {
        "slug": "scaffold-competent",
        "label": "Scaffold Competent Person",
        "required": false
      }
    ],
    "defaultPayTypeCode": "8ST_8OT",
    "features": {
      "perDiem": true,
      "flatRates": false,
      "guaranteedHours": true,
      "unionSupport": true,
      "vendorPay": true,
      "clockPunches": true,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "PROJECT",
        "label": "Project"
      },
      {
        "code": "WORK_AREA",
        "label": "Work area"
      }
    ],
    "demoProfile": {
      "currency": "USD",
      "regions": 3,
      "sitesPerRegion": 12,
      "zonesPerSite": 4,
      "labourHoursPerSitePerDay": 480,
      "labourCostPerHour": 38,
      "spendPerSitePerDay": 42000,
      "downtimeMinutesPerSitePerDay": 60,
      "carbonKgPerLabourHour": 9.0
    }
  },
  {
    "slug": "event-staffing",
    "label": "Event Staffing",
    "emoji": "🎤",
    "terminology": {
      "workUnit": "Event",
      "role": "Job",
      "position": "Position",
      "worker": "Crew Member",
      "agreement": "Contract"
    },
    "roleLabels": {
      "workforce_manager": "Production Coordinator",
      "ops_supervisor": "Stage Manager",
      "time_approver": "Lead Crew Chief"
    },
    "classificationLabels": {
      "W2": "W2 Crew",
      "CONTRACTOR": "1099 Tech",
      "CASUAL": "Local Runner",
      "UNION_W2": "IATSE Crew"
    },
    "requiredCertifications": [
      {
        "slug": "rigging-cert",
        "label": "Arena Rigging ETCP",
        "required": false
      },
      {
        "slug": "electrical-safety",
        "label": "NFPA 70E Safety",
        "required": false
      },
      {
        "slug": "forklift",
        "label": "Stage Forklift Operator",
        "required": false
      }
    ],
    "defaultPayTypeCode": "8ST_8OT",
    "features": {
      "perDiem": true,
      "flatRates": true,
      "guaranteedHours": true,
      "unionSupport": true,
      "vendorPay": true,
      "clockPunches": true,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "VENUE",
        "label": "Venue"
      },
      {
        "code": "ZONE",
        "label": "Zone"
      }
    ],
    "demoProfile": {
      "currency": "USD",
      "regions": 3,
      "sitesPerRegion": 10,
      "zonesPerSite": 6,
      "labourHoursPerSitePerDay": 300,
      "labourCostPerHour": 22,
      "spendPerSitePerDay": 9000,
      "downtimeMinutesPerSitePerDay": 10,
      "carbonKgPerLabourHour": 0.8
    }
  },
  {
    "slug": "healthcare",
    "label": "Healthcare & Clinical Staffing",
    "emoji": "🏥",
    "terminology": {
      "workUnit": "Shift",
      "role": "Department",
      "position": "Role",
      "worker": "Clinician",
      "agreement": "Engagement Letter"
    },
    "roleLabels": {
      "workforce_manager": "Director of Nursing",
      "ops_supervisor": "Charge Nurse",
      "time_approver": "Staffing Coordinator"
    },
    "classificationLabels": {
      "W2": "Staff Clinician",
      "AGENCY": "Travel Nurse / Locum",
      "CASUAL": "PRN / Per Diem Clinician"
    },
    "requiredCertifications": [
      {
        "slug": "rn-license",
        "label": "State Board RN License",
        "required": true
      },
      {
        "slug": "bls-cpr",
        "label": "Basic Life Support (BLS / CPR)",
        "required": true
      },
      {
        "slug": "acls",
        "label": "Advanced Cardiac Life Support (ACLS)",
        "required": false
      }
    ],
    "defaultPayTypeCode": "8ST_8OT",
    "features": {
      "perDiem": true,
      "flatRates": false,
      "guaranteedHours": true,
      "unionSupport": true,
      "vendorPay": true,
      "clockPunches": true,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "FACILITY",
        "label": "Facility"
      },
      {
        "code": "WARD",
        "label": "Ward"
      }
    ],
    "demoProfile": {
      "currency": "USD",
      "regions": 3,
      "sitesPerRegion": 8,
      "zonesPerSite": 10,
      "labourHoursPerSitePerDay": 2200,
      "labourCostPerHour": 48,
      "spendPerSitePerDay": 65000,
      "downtimeMinutesPerSitePerDay": 15,
      "carbonKgPerLabourHour": 2.4
    }
  },
  {
    "slug": "jp-metro-industrial",
    "label": "Japan Metro & Industrial Field Ops (現場)",
    "emoji": "🚅",
    "terminology": {
      "workUnit": "現場 / 工区 (Work Section)",
      "role": "職種 (Trade Craft)",
      "position": "配置スロット (Staff Slot)",
      "worker": "作業員 (Field Specialist)",
      "agreement": "請負・雇用契約 (Subcontract Covenant)"
    },
    "roleLabels": {
      "track_maintenance": "保線工 (Track Maintenance Specialist)",
      "electrical_signaling": "信号・通信電工 (Rail Signaling Electrician)",
      "catenary_lineman": "架線工 (Overhead Catenary Specialist)",
      "safety_watchman": "列車見張員 (Train Approach Safety Watchman)",
      "heavy_equipment": "軌道モータカー操縦士 (Track Motorcar Operator)"
    },
    "classificationLabels": {
      "PRIME": "元請社員 (Prime Contractor Employee)",
      "TIER_1": "一次下請 (Tier 1 Subcontractor)",
      "TIER_2": "二次下請 (Tier 2 Field Specialist)",
      "CASUAL": "常用・日々雇用 (Casual Daily Specialist)"
    },
    "requiredCertifications": [
      {
        "slug": "tamakake",
        "label": "玉掛け技能講習 (Crane Slinging License)",
        "required": true
      },
      {
        "slug": "electrician_type2",
        "label": "第二種電気工事士 (Type-2 Electrical Specialist)",
        "required": false
      },
      {
        "slug": "track_watchman",
        "label": "列車見張員認定証 (Rail Safety Watchman Certified)",
        "required": true
      },
      {
        "slug": "oxygen_deficiency",
        "label": "酸素欠乏危険作業主任者 (Confined Space Safety)",
        "required": false
      }
    ],
    "defaultPayTypeCode": "HOURLY",
    "features": {
      "perDiem": true,
      "flatRates": true,
      "guaranteedHours": true,
      "unionSupport": false,
      "vendorPay": true,
      "clockPunches": true,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "PLANT",
        "label": "Plant"
      },
      {
        "code": "LINE",
        "label": "Line"
      }
    ],
    "demoProfile": {
      "currency": "JPY",
      "regions": 3,
      "sitesPerRegion": 6,
      "zonesPerSite": 8,
      "labourHoursPerSitePerDay": 900,
      "labourCostPerHour": 2600,
      "spendPerSitePerDay": 4200000,
      "downtimeMinutesPerSitePerDay": 45,
      "carbonKgPerLabourHour": 6.5
    }
  },
  {
    "slug": "logistics",
    "label": "Logistics & Fleet Operations",
    "emoji": "🚛",
    "terminology": {
      "workUnit": "Route",
      "role": "Run",
      "position": "Slot",
      "worker": "Driver",
      "agreement": "Carrier Agreement"
    },
    "roleLabels": {
      "workforce_manager": "Fleet Dispatch Manager",
      "ops_supervisor": "Route Supervisor",
      "time_approver": "Dispatch Lead"
    },
    "classificationLabels": {
      "W2": "Company Driver",
      "CONTRACTOR": "Owner Operator",
      "TPV": "Freight Broker Carrier"
    },
    "requiredCertifications": [
      {
        "slug": "cdl-class-a",
        "label": "CDL Class A License",
        "required": true
      },
      {
        "slug": "dot-medical",
        "label": "DOT Medical Card",
        "required": true
      },
      {
        "slug": "hazmat",
        "label": "Hazmat Endorsement",
        "required": false
      }
    ],
    "defaultPayTypeCode": "10ST",
    "features": {
      "perDiem": true,
      "flatRates": true,
      "guaranteedHours": true,
      "unionSupport": true,
      "vendorPay": true,
      "clockPunches": true,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "DEPOT",
        "label": "Depot"
      },
      {
        "code": "BAY",
        "label": "Bay"
      }
    ],
    "demoProfile": {
      "currency": "USD",
      "regions": 4,
      "sitesPerRegion": 10,
      "zonesPerSite": 6,
      "labourHoursPerSitePerDay": 640,
      "labourCostPerHour": 24,
      "spendPerSitePerDay": 18000,
      "downtimeMinutesPerSitePerDay": 35,
      "carbonKgPerLabourHour": 4.2
    }
  },
  {
    "slug": "manufacturing",
    "label": "Manufacturing",
    "emoji": "🏭",
    "terminology": {
      "workUnit": "Shift Block",
      "role": "Production Line",
      "position": "Operator Slot",
      "worker": "Operator",
      "agreement": "Onboarding Doc"
    },
    "roleLabels": {
      "workforce_manager": "Plant Manager",
      "ops_supervisor": "Line Supervisor",
      "time_approver": "Team Leader"
    },
    "classificationLabels": {
      "W2": "Full-time Operator",
      "CASUAL": "Casual / Temp",
      "CONTRACTOR": "Contract Worker"
    },
    "requiredCertifications": [
      {
        "slug": "safety-induction",
        "label": "Safety Induction",
        "required": true
      },
      {
        "slug": "forklift-license",
        "label": "Forklift License",
        "required": false
      },
      {
        "slug": "first-aid",
        "label": "First Aid",
        "required": false
      }
    ],
    "defaultPayTypeCode": "10ST",
    "features": {
      "perDiem": false,
      "flatRates": false,
      "guaranteedHours": true,
      "unionSupport": true,
      "vendorPay": false,
      "clockPunches": true,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "PLANT",
        "label": "Plant"
      },
      {
        "code": "LINE",
        "label": "Line"
      }
    ],
    "demoProfile": {
      "currency": "USD",
      "regions": 3,
      "sitesPerRegion": 6,
      "zonesPerSite": 8,
      "labourHoursPerSitePerDay": 1100,
      "labourCostPerHour": 29,
      "spendPerSitePerDay": 55000,
      "downtimeMinutesPerSitePerDay": 50,
      "carbonKgPerLabourHour": 7.5
    }
  },
  {
    "slug": "qsr",
    "label": "Quick Service Restaurant & F&B",
    "emoji": "🍔",
    "terminology": {
      "workUnit": "Day Part",
      "role": "Station",
      "position": "Crew Slot",
      "worker": "Team Member",
      "agreement": "Offer Letter"
    },
    "roleLabels": {
      "workforce_manager": "Store Manager",
      "ops_supervisor": "Shift Supervisor",
      "time_approver": "Team Lead"
    },
    "classificationLabels": {
      "W2": "Full-Time Team Member",
      "CASUAL": "Part-Time Crew",
      "PERMANENT": "Assistant Manager"
    },
    "requiredCertifications": [
      {
        "slug": "food-handler",
        "label": "Food Handler Card",
        "required": true
      },
      {
        "slug": "servsafe-manager",
        "label": "ServSafe Manager",
        "required": false
      },
      {
        "slug": "allergen-safety",
        "label": "Allergen Awareness",
        "required": false
      }
    ],
    "defaultPayTypeCode": "10ST",
    "features": {
      "perDiem": false,
      "flatRates": false,
      "guaranteedHours": false,
      "unionSupport": false,
      "vendorPay": false,
      "clockPunches": true,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "STORE",
        "label": "Store"
      },
      {
        "code": "AREA",
        "label": "Area"
      }
    ],
    "demoProfile": {
      "currency": "USD",
      "regions": 4,
      "sitesPerRegion": 25,
      "zonesPerSite": 2,
      "labourHoursPerSitePerDay": 120,
      "labourCostPerHour": 16,
      "spendPerSitePerDay": 2600,
      "downtimeMinutesPerSitePerDay": 18,
      "carbonKgPerLabourHour": 1.1
    }
  },
  {
    "slug": "travel-crew",
    "label": "Travel, Tour & Crewing",
    "emoji": "✈️",
    "terminology": {
      "workUnit": "Trip / Tour",
      "role": "Leg",
      "position": "Seat",
      "worker": "Cabin Crew",
      "agreement": "LOA"
    },
    "roleLabels": {
      "workforce_manager": "Crew Operations Director",
      "ops_supervisor": "Purser / Tour Lead",
      "time_approver": "Roster Manager"
    },
    "classificationLabels": {
      "W2": "Flight / Tour Crew",
      "CONTRACTOR": "Contract Specialist",
      "CASUAL": "Standby Crew"
    },
    "requiredCertifications": [
      {
        "slug": "faa-flight-attendant",
        "label": "FAA Crewmember Certificate",
        "required": false
      },
      {
        "slug": "passport-visa",
        "label": "Valid Passport & Travel Visas",
        "required": true
      }
    ],
    "defaultPayTypeCode": "FLAT_D",
    "features": {
      "perDiem": true,
      "flatRates": true,
      "guaranteedHours": true,
      "unionSupport": true,
      "vendorPay": false,
      "clockPunches": false,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "BASE",
        "label": "Crew base"
      },
      {
        "code": "TERMINAL",
        "label": "Terminal"
      }
    ],
    "demoProfile": {
      "currency": "USD",
      "regions": 4,
      "sitesPerRegion": 5,
      "zonesPerSite": 3,
      "labourHoursPerSitePerDay": 900,
      "labourCostPerHour": 41,
      "spendPerSitePerDay": 30000,
      "downtimeMinutesPerSitePerDay": 25,
      "carbonKgPerLabourHour": 12.0
    }
  },
  {
    "slug": "warehouse",
    "label": "Warehouse & 3PL",
    "emoji": "📦",
    "terminology": {
      "workUnit": "Pick Wave",
      "role": "Zone",
      "position": "Slot",
      "worker": "Associate",
      "agreement": "Assignment"
    },
    "roleLabels": {
      "workforce_manager": "DC General Manager",
      "ops_supervisor": "Floor Supervisor",
      "time_approver": "Shift Lead"
    },
    "classificationLabels": {
      "W2": "Core Associate",
      "AGENCY": "3PL Temp",
      "CASUAL": "Seasonal Picker"
    },
    "requiredCertifications": [
      {
        "slug": "reach-truck",
        "label": "High-Reach Forklift",
        "required": false
      },
      {
        "slug": "rf-scanner",
        "label": "WMS Scanner Certified",
        "required": false
      }
    ],
    "defaultPayTypeCode": "10ST",
    "features": {
      "perDiem": false,
      "flatRates": false,
      "guaranteedHours": true,
      "unionSupport": false,
      "vendorPay": true,
      "clockPunches": true,
      "mobileTimesheet": true
    },
    "placeTypes": [
      {
        "code": "REGION",
        "label": "Region"
      },
      {
        "code": "WAREHOUSE",
        "label": "Warehouse"
      },
      {
        "code": "ZONE",
        "label": "Zone"
      }
    ],
    "demoProfile": {
      "currency": "USD",
      "regions": 4,
      "sitesPerRegion": 8,
      "zonesPerSite": 6,
      "labourHoursPerSitePerDay": 720,
      "labourCostPerHour": 21,
      "spendPerSitePerDay": 15000,
      "downtimeMinutesPerSitePerDay": 30,
      "carbonKgPerLabourHour": 3.1
    }
  }
];

export const BUNDLED_COUNTRY_PACKS: readonly CountryPackV1[] = [
  {
    "code": "AU",
    "label": "Australia",
    "currency": "AUD",
    "timeZones": [
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Brisbane",
      "Australia/Adelaide",
      "Australia/Darwin",
      "Australia/Perth",
      "Australia/Hobart"
    ],
    "subdivisions": [
      {
        "code": "AU-ACT",
        "label": "Australian Capital Territory"
      },
      {
        "code": "AU-NSW",
        "label": "New South Wales"
      },
      {
        "code": "AU-NT",
        "label": "Northern Territory"
      },
      {
        "code": "AU-QLD",
        "label": "Queensland"
      },
      {
        "code": "AU-SA",
        "label": "South Australia"
      },
      {
        "code": "AU-TAS",
        "label": "Tasmania"
      },
      {
        "code": "AU-VIC",
        "label": "Victoria"
      },
      {
        "code": "AU-WA",
        "label": "Western Australia"
      }
    ],
    "weeklyOtThreshold": 38,
    "dataRetentionMonths": 84,
    "payroll": {
      "type": "FAIR_WORK_AU",
      "dailyRegularCap": 7.6,
      "dailyOtCap": 9.6,
      "otMultiplier": 1.5,
      "dtMultiplier": 2.0,
      "holidayRegularCap": 7.6,
      "holidayOtMultiplier": 2.5,
      "holidayDtMultiplier": 2.5,
      "seventhDayRule": true,
      "deductions": {
        "superannuation_pct": 11.5
      }
    },
    "exportFormats": [
      {
        "code": "ABA",
        "label": "Australian Bank File (ABA)",
        "periodDays": 14
      },
      {
        "code": "STP_CSV",
        "label": "Single Touch Payroll Export",
        "periodDays": 14
      }
    ]
  },
  {
    "code": "EU",
    "label": "European Union (WTD Standard)",
    "currency": "EUR",
    "timeZones": [
      "Europe/Brussels",
      "Europe/Berlin",
      "Europe/Paris",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Dublin",
      "Europe/Warsaw"
    ],
    "subdivisions": [],
    "weeklyOtThreshold": 48,
    "dataRetentionMonths": 24,
    "payroll": {
      "type": "EU_WTD",
      "dailyRegularCap": 8,
      "dailyOtCap": null,
      "otMultiplier": 1.25,
      "dtMultiplier": 1.5,
      "holidayRegularCap": 8,
      "holidayOtMultiplier": 2.0,
      "holidayDtMultiplier": 2.0,
      "seventhDayRule": true
    },
    "exportFormats": [
      {
        "code": "SEPA_XML",
        "label": "SEPA Pain.001 Credit Transfer (XML)",
        "periodDays": 30
      },
      {
        "code": "CSV",
        "label": "Generic Eurozone Payroll CSV",
        "periodDays": 30
      }
    ]
  },
  {
    "code": "GB",
    "label": "United Kingdom",
    "currency": "GBP",
    "timeZones": [
      "Europe/London"
    ],
    "subdivisions": [
      {
        "code": "GB-ENG",
        "label": "England"
      },
      {
        "code": "GB-SCT",
        "label": "Scotland"
      },
      {
        "code": "GB-WLS",
        "label": "Wales"
      },
      {
        "code": "GB-NIR",
        "label": "Northern Ireland"
      }
    ],
    "weeklyOtThreshold": 48,
    "dataRetentionMonths": 72,
    "payroll": {
      "type": "UK_PAYE",
      "dailyRegularCap": 8,
      "dailyOtCap": null,
      "otMultiplier": 1.5,
      "dtMultiplier": 2.0,
      "holidayRegularCap": 8,
      "holidayOtMultiplier": 1.5,
      "holidayDtMultiplier": 2.0,
      "seventhDayRule": true,
      "deductions": {
        "ni_class_1_employee_pct": 8.0,
        "ni_class_1_employer_pct": 13.8,
        "workplace_pension_employee_pct": 5.0,
        "workplace_pension_employer_pct": 3.0
      }
    },
    "exportFormats": [
      {
        "code": "BACS_CSV",
        "label": "BACS Direct Credit File",
        "periodDays": 30
      },
      {
        "code": "HMRC_RTI",
        "label": "HMRC RTI FPS Export",
        "periodDays": 30
      }
    ]
  },
  {
    "code": "IN",
    "label": "India",
    "currency": "INR",
    "timeZones": [
      "Asia/Kolkata"
    ],
    "subdivisions": [],
    "weeklyOtThreshold": 48,
    "dataRetentionMonths": 60,
    "payroll": {
      "type": "INDIA_FACTORIES_ACT",
      "dailyRegularCap": 9,
      "dailyOtCap": null,
      "otMultiplier": 2.0,
      "dtMultiplier": null,
      "holidayRegularCap": 9,
      "holidayOtMultiplier": 2.0,
      "holidayDtMultiplier": 2.0,
      "seventhDayRule": false,
      "deductions": {
        "epf_employee_pct": 12.0,
        "epf_employer_pct": 12.0,
        "esi_employee_pct": 0.75,
        "esi_employer_pct": 3.25,
        "pt_by_state": true
      }
    },
    "exportFormats": [
      {
        "code": "XLSX",
        "label": "Excel Payroll Register",
        "periodDays": 30
      },
      {
        "code": "CSV",
        "label": "Generic Indian Bank Transfer CSV",
        "periodDays": 7
      }
    ]
  },
  {
    "code": "JP",
    "label": "Japan",
    "currency": "JPY",
    "timeZones": [
      "Asia/Tokyo"
    ],
    "subdivisions": [
      {
        "code": "JP-01",
        "label": "Hokkaido"
      },
      {
        "code": "JP-02",
        "label": "Aomori"
      },
      {
        "code": "JP-03",
        "label": "Iwate"
      },
      {
        "code": "JP-04",
        "label": "Miyagi"
      },
      {
        "code": "JP-05",
        "label": "Akita"
      },
      {
        "code": "JP-06",
        "label": "Yamagata"
      },
      {
        "code": "JP-07",
        "label": "Fukushima"
      },
      {
        "code": "JP-08",
        "label": "Ibaraki"
      },
      {
        "code": "JP-09",
        "label": "Tochigi"
      },
      {
        "code": "JP-10",
        "label": "Gunma"
      },
      {
        "code": "JP-11",
        "label": "Saitama"
      },
      {
        "code": "JP-12",
        "label": "Chiba"
      },
      {
        "code": "JP-13",
        "label": "Tokyo"
      },
      {
        "code": "JP-14",
        "label": "Kanagawa"
      },
      {
        "code": "JP-15",
        "label": "Niigata"
      },
      {
        "code": "JP-16",
        "label": "Toyama"
      },
      {
        "code": "JP-17",
        "label": "Ishikawa"
      },
      {
        "code": "JP-18",
        "label": "Fukui"
      },
      {
        "code": "JP-19",
        "label": "Yamanashi"
      },
      {
        "code": "JP-20",
        "label": "Nagano"
      },
      {
        "code": "JP-21",
        "label": "Gifu"
      },
      {
        "code": "JP-22",
        "label": "Shizuoka"
      },
      {
        "code": "JP-23",
        "label": "Aichi"
      },
      {
        "code": "JP-24",
        "label": "Mie"
      },
      {
        "code": "JP-25",
        "label": "Shiga"
      },
      {
        "code": "JP-26",
        "label": "Kyoto"
      },
      {
        "code": "JP-27",
        "label": "Osaka"
      },
      {
        "code": "JP-28",
        "label": "Hyogo"
      },
      {
        "code": "JP-29",
        "label": "Nara"
      },
      {
        "code": "JP-30",
        "label": "Wakayama"
      },
      {
        "code": "JP-31",
        "label": "Tottori"
      },
      {
        "code": "JP-32",
        "label": "Shimane"
      },
      {
        "code": "JP-33",
        "label": "Okayama"
      },
      {
        "code": "JP-34",
        "label": "Hiroshima"
      },
      {
        "code": "JP-35",
        "label": "Yamaguchi"
      },
      {
        "code": "JP-36",
        "label": "Tokushima"
      },
      {
        "code": "JP-37",
        "label": "Kagawa"
      },
      {
        "code": "JP-38",
        "label": "Ehime"
      },
      {
        "code": "JP-39",
        "label": "Kochi"
      },
      {
        "code": "JP-40",
        "label": "Fukuoka"
      },
      {
        "code": "JP-41",
        "label": "Saga"
      },
      {
        "code": "JP-42",
        "label": "Nagasaki"
      },
      {
        "code": "JP-43",
        "label": "Kumamoto"
      },
      {
        "code": "JP-44",
        "label": "Oita"
      },
      {
        "code": "JP-45",
        "label": "Miyazaki"
      },
      {
        "code": "JP-46",
        "label": "Kagoshima"
      },
      {
        "code": "JP-47",
        "label": "Okinawa"
      }
    ],
    "weeklyOtThreshold": 40,
    "dataRetentionMonths": 60,
    "payroll": {
      "type": "JAPAN_LABOUR_STANDARDS_ACT",
      "dailyRegularCap": 8,
      "dailyOtCap": null,
      "otMultiplier": 1.25,
      "dtMultiplier": null,
      "holidayRegularCap": 0,
      "holidayOtMultiplier": 1.35,
      "holidayDtMultiplier": null,
      "seventhDayRule": false
    },
    "exportFormats": [
      {
        "code": "XLSX",
        "label": "Payroll register (Excel)",
        "periodDays": 30
      },
      {
        "code": "CSV",
        "label": "Payroll export CSV",
        "periodDays": 30
      }
    ]
  },
  {
    "code": "US",
    "label": "United States",
    "currency": "USD",
    "timeZones": [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Phoenix",
      "America/Los_Angeles",
      "America/Anchorage",
      "Pacific/Honolulu"
    ],
    "subdivisions": [
      {
        "code": "US-AL",
        "label": "Alabama"
      },
      {
        "code": "US-AK",
        "label": "Alaska"
      },
      {
        "code": "US-AZ",
        "label": "Arizona"
      },
      {
        "code": "US-AR",
        "label": "Arkansas"
      },
      {
        "code": "US-CA",
        "label": "California"
      },
      {
        "code": "US-CO",
        "label": "Colorado"
      },
      {
        "code": "US-CT",
        "label": "Connecticut"
      },
      {
        "code": "US-DE",
        "label": "Delaware"
      },
      {
        "code": "US-FL",
        "label": "Florida"
      },
      {
        "code": "US-GA",
        "label": "Georgia"
      },
      {
        "code": "US-HI",
        "label": "Hawaii"
      },
      {
        "code": "US-ID",
        "label": "Idaho"
      },
      {
        "code": "US-IL",
        "label": "Illinois"
      },
      {
        "code": "US-IN",
        "label": "Indiana"
      },
      {
        "code": "US-IA",
        "label": "Iowa"
      },
      {
        "code": "US-KS",
        "label": "Kansas"
      },
      {
        "code": "US-KY",
        "label": "Kentucky"
      },
      {
        "code": "US-LA",
        "label": "Louisiana"
      },
      {
        "code": "US-ME",
        "label": "Maine"
      },
      {
        "code": "US-MD",
        "label": "Maryland"
      },
      {
        "code": "US-MA",
        "label": "Massachusetts"
      },
      {
        "code": "US-MI",
        "label": "Michigan"
      },
      {
        "code": "US-MN",
        "label": "Minnesota"
      },
      {
        "code": "US-MS",
        "label": "Mississippi"
      },
      {
        "code": "US-MO",
        "label": "Missouri"
      },
      {
        "code": "US-MT",
        "label": "Montana"
      },
      {
        "code": "US-NE",
        "label": "Nebraska"
      },
      {
        "code": "US-NV",
        "label": "Nevada"
      },
      {
        "code": "US-NH",
        "label": "New Hampshire"
      },
      {
        "code": "US-NJ",
        "label": "New Jersey"
      },
      {
        "code": "US-NM",
        "label": "New Mexico"
      },
      {
        "code": "US-NY",
        "label": "New York"
      },
      {
        "code": "US-NC",
        "label": "North Carolina"
      },
      {
        "code": "US-ND",
        "label": "North Dakota"
      },
      {
        "code": "US-OH",
        "label": "Ohio"
      },
      {
        "code": "US-OK",
        "label": "Oklahoma"
      },
      {
        "code": "US-OR",
        "label": "Oregon"
      },
      {
        "code": "US-PA",
        "label": "Pennsylvania"
      },
      {
        "code": "US-RI",
        "label": "Rhode Island"
      },
      {
        "code": "US-SC",
        "label": "South Carolina"
      },
      {
        "code": "US-SD",
        "label": "South Dakota"
      },
      {
        "code": "US-TN",
        "label": "Tennessee"
      },
      {
        "code": "US-TX",
        "label": "Texas"
      },
      {
        "code": "US-UT",
        "label": "Utah"
      },
      {
        "code": "US-VT",
        "label": "Vermont"
      },
      {
        "code": "US-VA",
        "label": "Virginia"
      },
      {
        "code": "US-WA",
        "label": "Washington"
      },
      {
        "code": "US-WV",
        "label": "West Virginia"
      },
      {
        "code": "US-WI",
        "label": "Wisconsin"
      },
      {
        "code": "US-WY",
        "label": "Wyoming"
      },
      {
        "code": "US-DC",
        "label": "District of Columbia"
      }
    ],
    "weeklyOtThreshold": 40,
    "dataRetentionMonths": 84,
    "payroll": {
      "type": "FLSA",
      "dailyRegularCap": 10,
      "dailyOtCap": null,
      "otMultiplier": 1.5,
      "dtMultiplier": null,
      "holidayRegularCap": 8,
      "holidayOtMultiplier": 1.5,
      "holidayDtMultiplier": 2.0,
      "seventhDayRule": false,
      "stateRules": {
        "CA": {
          "dailyRegularCap": 8,
          "dailyOtCap": 12,
          "otMultiplier": 1.5,
          "dtMultiplier": 2.0,
          "seventhDayRule": true
        }
      }
    },
    "exportFormats": [
      {
        "code": "ADP_CSV",
        "label": "ADP Payline Export (CSV)",
        "periodDays": 7
      },
      {
        "code": "QUICKBOOKS_IIF",
        "label": "QuickBooks Payroll (IIF)",
        "periodDays": 14
      }
    ]
  }
];
