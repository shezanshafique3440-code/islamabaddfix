import type { ChargeResult, PaymentProvider, RefundResult } from '../types';

/**
 * Bank transfer / IBFT. The customer transfers to the platform account and ops
 * confirms receipt, so the charge is deferred and reconciliation is manual by
 * design. This is honest about being a manual rail rather than simulating one.
 */
export const bankTransferProvider: PaymentProvider = {
  key: 'bank_transfer',
  method: 'BANK_TRANSFER',
  label: 'Bank transfer',
  description: 'Transfer from a bank or mobile wallet; it settles once the receipt is confirmed.',
  isConfigured: () => true,
  initialStatus: () => 'PENDING',

  async charge(): Promise<ChargeResult> {
    return {
      kind: 'DEFERRED',
      note: 'After the transfer the ops team confirms the receipt.',
    };
  },

  async refund(intent): Promise<RefundResult> {
    return {
      kind: 'MANUAL_REQUIRED',
      instructions: `Transfer to the customer’s account manually. Reason: ${intent.reason}`,
    };
  },
};
