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
  labelUr: 'Bank transfer',
  description: 'Bank ya mobile wallet se transfer karein; receipt confirm hone par settle hoga.',
  isConfigured: () => true,
  initialStatus: () => 'PENDING',

  async charge(): Promise<ChargeResult> {
    return {
      kind: 'DEFERRED',
      note: 'Transfer ke baad ops team receipt confirm karegi.',
    };
  },

  async refund(intent): Promise<RefundResult> {
    return {
      kind: 'MANUAL_REQUIRED',
      instructions: `Customer ke account mein manually transfer karein. Wajah: ${intent.reason}`,
    };
  },
};
