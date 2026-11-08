// Trust layer types. Everything in src/trust is deterministic: no AI imports allowed.

export type PayoutMethod = "paypal_email" | "paypal_phone" | "venmo" | "bank";

export interface PayoutDetails {
  method: PayoutMethod;
  receiver: string;
  currency: string;
  country?: string;
}

export type PayeeType = "freelancer" | "supplier" | "employee";

export interface PayeeContacts {
  phones: string[];
  emails: string[];
  domains: string[];
}

export interface PayeeRecord {
  id: string;
  name: string;
  type: PayeeType;
  verifiedPayout: PayoutDetails | null;
  // When the current verified payout details took effect (after any change request).
  payoutVerifiedAt: Date | null;
  contacts: PayeeContacts;
  createdAt: Date;
  firstPaidAt: Date | null;
  // Employees only: day of month they are paid.
  paydayDayOfMonth?: number;
  typicalAmount?: { median: number; max: number };
}

export type IntentStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

// Amounts are integer minor units (cents).
export interface PaymentIntent {
  id: string;
  payeeId: string | null;
  payeeName: string;
  amount: number;
  currency: string;
  payout: PayoutDetails;
  invoiceNumber?: string;
  createdAt: Date;
  createdBy: string;
  status: IntentStatus;
}

export type Severity = "red" | "amber";

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9";

export interface Flag {
  ruleId: RuleId;
  severity: Severity;
  why: string;
  evidence: Record<string, unknown>;
}

export interface StoredFlag extends Flag {
  id: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

// Structured signals extracted from a message by the AI. Code decides what they mean.
export interface MessageSignals {
  urgency: boolean;
  authorityClaim: boolean;
  secrecyRequest: boolean;
  offChannelRequest: boolean;
  paymentDetailsChange: boolean;
  claimedSender: string | null;
}

export interface MessageContacts {
  phones: string[];
  emails: string[];
  urls: string[];
}

export interface Approval {
  id: string;
  intentId: string;
  userId: string;
  intentHash: string;
  passkeyVerified: boolean;
  createdAt: Date;
}

export interface Thresholds {
  twoApproverMinor: number;
  coolingOffHours: number;
  splitWindowHours: number;
  duplicateWindowDays: number;
  paydayWindowDays: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  twoApproverMinor: 100_000,
  coolingOffHours: 24,
  splitWindowHours: 72,
  duplicateWindowDays: 60,
  paydayWindowDays: 5,
};
