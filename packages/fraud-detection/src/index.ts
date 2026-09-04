/**
 * @gigalibs/fraud-detection
 *
 * Enterprise Fraud Risk Engine, Trust Heuristics & Geovelocity Guard.
 * Benchmark: Persona / Sift Science / Stripe Radar / Apache Metron.
 *
 * @module
 */

export type FraudDecision =
  | 'ALLOW'
  | 'CHALLENGE_MFA'
  | 'MANUAL_REVIEW'
  | 'BLOCK';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  city?: string | undefined;
  country?: string | undefined;
}

export interface GeovelocityCheck {
  previousLocation: GeoPoint;
  previousTimestamp: string;
  currentLocation: GeoPoint;
  currentTimestamp: string;
  distanceKm: number;
  elapsedHours: number;
  calculatedSpeedKph: number;
  isImpossibleTravel: boolean;
  riskWeight: number;
}

export interface FraudSignalInput {
  email: string;
  ipAddress: string;
  isVpnOrProxy?: boolean | undefined;
  deviceFingerprintHash?: string | undefined;
  failedAttemptsCount?: number | undefined;
  countryMismatch?: boolean | undefined; // IP country vs billing country
  cardVelocityPastHour?: number | undefined;
  transactionAmountCents?: number | undefined;
  geovelocity?: GeovelocityCheck | undefined;
}

export interface RiskFactor {
  signalName: string;
  weight: number;
  description: string;
}

export interface FraudAssessmentResult {
  score: number; // 0 (Low risk) to 100 (High risk)
  decision: FraudDecision;
  riskFactors: RiskFactor[];
  reasons: string[];
  recommendedAction: string;
  challengeRequired: boolean;
  assessedAt: string;
}

export interface QuarantinedTransaction {
  id: string;
  customerEmail: string;
  ipAddress: string;
  amountCents: number;
  score: number;
  decision: FraudDecision;
  reasons: string[];
  quarantinedAt: string;
  status: 'PENDING_REVIEW' | 'APPROVED_EXCEPTION' | 'BLOCKED_PERMANENT';
}

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'tempmail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'trashmail.com',
  'yopmail.com',
  'throwawaymail.com',
  'dispostable.com',
  'burnermail.io',
]);

export class FraudDetectionEngine {
  /**
   * Evaluates distance (Haversine) and speed between two consecutive geographical locations.
   * Flags speeds > 800 km/h as impossible travel / credential stuffing hijack.
   */
  static evaluateGeovelocity(
    prev: { location: GeoPoint; timestamp: string },
    curr: { location: GeoPoint; timestamp: string },
  ): GeovelocityCheck {
    const R = 6371.0; // Earth radius in km
    const dLat = ((curr.location.latitude - prev.location.latitude) * Math.PI) / 180;
    const dLon = ((curr.location.longitude - prev.location.longitude) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((prev.location.latitude * Math.PI) / 180) *
        Math.cos((curr.location.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = Number((R * c).toFixed(1));

    const t1 = new Date(prev.timestamp).getTime();
    const t2 = new Date(curr.timestamp).getTime();
    const elapsedMs = Math.max(1000, Math.abs(t2 - t1));
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    const calculatedSpeedKph = Math.round(distanceKm / elapsedHours);
    const isImpossibleTravel = calculatedSpeedKph > 800; // Faster than standard commercial aircraft

    return {
      previousLocation: prev.location,
      previousTimestamp: prev.timestamp,
      currentLocation: curr.location,
      currentTimestamp: curr.timestamp,
      distanceKm,
      elapsedHours: Number(elapsedHours.toFixed(2)),
      calculatedSpeedKph,
      isImpossibleTravel,
      riskWeight: isImpossibleTravel ? 50 : 0,
    };
  }

  /**
   * Assesses multi-factor fraud signals and produces a deterministic risk score and decision.
   */
  static assess(input: FraudSignalInput): FraudAssessmentResult {
    let score = 0;
    const riskFactors: RiskFactor[] = [];
    const reasons: string[] = [];

    // 1. Disposable Email Detection
    const emailDomain = input.email.split('@')[1]?.toLowerCase();
    if (emailDomain && DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
      const weight = 45;
      score += weight;
      riskFactors.push({ signalName: 'DISPOSABLE_EMAIL', weight, description: `Disposable email domain: ${emailDomain}` });
      reasons.push('Disposable or burner email domain detected');
    }

    // 2. Impossible Travel Geovelocity Hijack
    if (input.geovelocity && input.geovelocity.isImpossibleTravel) {
      const weight = 50;
      score += weight;
      riskFactors.push({
        signalName: 'IMPOSSIBLE_GEOVELOCITY',
        weight,
        description: `Travel speed: ${input.geovelocity.calculatedSpeedKph} km/h (${input.geovelocity.distanceKm} km in ${input.geovelocity.elapsedHours}h)`,
      });
      reasons.push(`Impossible travel speed detected (${input.geovelocity.calculatedSpeedKph} km/h)`);
    }

    // 3. Anonymizing VPN / Proxy / Tor
    if (input.isVpnOrProxy) {
      const weight = 30;
      score += weight;
      riskFactors.push({ signalName: 'ANONYMIZING_PROXY', weight, description: 'Commercial VPN or Proxy detected' });
      reasons.push('Anonymizing VPN or commercial proxy detected');
    }

    // 4. Country / Geolocation Mismatch
    if (input.countryMismatch) {
      const weight = 20;
      score += weight;
      riskFactors.push({ signalName: 'GEO_MISMATCH', weight, description: 'IP Country does not match Billing Country' });
      reasons.push('Billing country does not match IP address geolocation');
    }

    // 5. Card Velocity & Rapid Firing
    if (input.cardVelocityPastHour && input.cardVelocityPastHour > 3) {
      const weight = 35;
      score += weight;
      riskFactors.push({ signalName: 'VELOCITY_SPIKE', weight, description: `${input.cardVelocityPastHour} transactions/hr` });
      reasons.push(`High payment attempt velocity: ${input.cardVelocityPastHour} attempts/hr`);
    }

    // 6. Repeated Authentication Failures
    if (input.failedAttemptsCount && input.failedAttemptsCount > 3) {
      const weight = 25;
      score += weight;
      riskFactors.push({ signalName: 'AUTH_FAILURES', weight, description: `${input.failedAttemptsCount} failed login attempts` });
      reasons.push(`Repeated failed verification attempts: ${input.failedAttemptsCount}`);
    }

    // 7. High-Value Financial Outlier
    if (input.transactionAmountCents && input.transactionAmountCents > 1000000) {
      // > $10,000 transaction
      const weight = 15;
      score += weight;
      riskFactors.push({ signalName: 'HIGH_VALUE_OUTLIER', weight, description: `Transaction > $10k ($${(input.transactionAmountCents / 100).toLocaleString()})` });
      reasons.push('High-value financial transaction requires step-up assurance');
    }

    score = Math.min(100, Math.max(0, score));

    let decision: FraudDecision = 'ALLOW';
    let recommendedAction = 'Transaction cleared without challenge.';
    let challengeRequired = false;

    if (score >= 75) {
      decision = 'BLOCK';
      recommendedAction = 'Automatically block transaction and place tenant account on security quarantine.';
    } else if (score >= 50) {
      decision = 'MANUAL_REVIEW';
      recommendedAction = 'Hold transaction in Dead-Letter Queue for Risk Operations review.';
    } else if (score >= 20) {
      decision = 'CHALLENGE_MFA';
      recommendedAction = 'Require mandatory step-up TOTP / SMS 2FA verification before proceeding.';
      challengeRequired = true;
    }

    return {
      score,
      decision,
      riskFactors,
      reasons,
      recommendedAction,
      challengeRequired,
      assessedAt: new Date().toISOString(),
    };
  }
}
