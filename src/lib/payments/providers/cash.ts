import type { ChargeResult, PaymentProvider, RefundResult } from '../types';

/**
 * Cash on Service — the MVP default and, realistically, how most Islamabad
 * jobs get paid.
 *
 * Nothing is collected at booking time. The provider marks the cash received
 * at completion, which flips the Payment row to PAID through the normal API;
 * this driver does not pretend to move money.
 */
export const cashProvider: PaymentProvider = {
  key: 'cash',
  method: 'CASH',
  label: 'Cash on Service',
  labelUr: 'Kaam ke baad cash',
  description: 'Technician ko kaam mukammal hone par cash dein.',
  isConfigured: () => true,
  initialStatus: () => 'PENDING',

  async charge(): Promise<ChargeResult> {
    return {
      kind: 'DEFERRED',
      note: 'Cash kaam mukammal hone par collect hoga.',
    };
  },

  async refund(intent): Promise<RefundResult> {
    // There is no rail to reverse; ops refunds cash by hand and records it.
    return {
      kind: 'MANUAL_REQUIRED',
      instructions: `Cash refund manually process karein aur record rakhein. Wajah: ${intent.reason}`,
    };
  },
};
