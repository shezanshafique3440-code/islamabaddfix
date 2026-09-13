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
  description: 'Pay the technician in cash when the work is complete.',
  isConfigured: () => true,
  initialStatus: () => 'PENDING',

  async charge(): Promise<ChargeResult> {
    return {
      kind: 'DEFERRED',
      note: 'Cash is collected when the work is complete.',
    };
  },

  async refund(intent): Promise<RefundResult> {
    // There is no rail to reverse; ops refunds cash by hand and records it.
    return {
      kind: 'MANUAL_REQUIRED',
      instructions: `Process the cash refund manually and keep a record. Reason: ${intent.reason}`,
    };
  },
};
