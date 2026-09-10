import type { Catalogue } from '@/lib/catalogue';

export type WizardCatalogue = Catalogue;

export type WizardStep =
  | 'intake'
  | 'service'
  | 'details'
  | 'location'
  | 'schedule'
  | 'provider'
  | 'confirm';

export interface ZoneOption {
  id: string;
  name: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
}

export interface AddressOption {
  id: string;
  label: string;
  addressLine: string;
  houseOrBuilding: string | null;
  zoneId: string | null;
  zoneName: string | null;
  city: string;
  isDefault: boolean;
}

export interface PaymentMethodOption {
  method: 'CASH' | 'BANK_TRANSFER' | 'ONLINE_GATEWAY';
  label: string;
  labelUr: string;
  description: string;
}

export interface NewAddressDraft {
  label: string;
  zoneId: string | null;
  addressLine: string;
  houseOrBuilding: string;
  landmark: string;
  contactPhone: string;
  latitude: number | null;
  longitude: number | null;
  saveForLater: boolean;
}

/** Everything the wizard collects. Nothing is written until the final POST. */
export interface BookingDraft {
  problem: string;
  categorySlug: string | null;
  serviceId: string | null;
  fileIds: string[];
  addressId: string | null;
  newAddress: NewAddressDraft | null;
  scheduledFor: string | null;
  providerId: string | null;
  isEmergency: boolean;
  urgency: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'ONLINE_GATEWAY';
  /** Structured intake result, stored with the booking for the technician. */
  intakeSummary: Record<string, unknown> | null;
  customerNotes: string;
}

export interface WizardConfig {
  minLeadMinutes: number;
  maxLeadDays: number;
  guaranteeDays: number;
  defaultEmergencyFeePaisa: number;
  emergencyEnabled: boolean;
  aiConfigured: boolean;
  mapsConfigured: boolean;
}

export interface WizardStepProps {
  draft: BookingDraft;
  patch: (updates: Partial<BookingDraft>) => void;
  onNext?: () => void;
  onBack?: () => void;
}

/** A service flattened with its category, as the wizard steps consume it. */
export interface FlatService {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  minPricePaisa: number;
  maxPricePaisa: number | null;
  requiresInspection: boolean;
  estimatedMinutes: number;
  isEmergencyEnabled: boolean;
  guaranteeEligible: boolean;
  categorySlug: string;
  categoryName: string;
  categoryIconKey: string;
}
