/**
 * All money in this codebase is an integer number of paisa (1 PKR = 100 paisa).
 * Nothing multiplies or divides rupees as floats.
 */

export const PAISA_PER_RUPEE = 100;

export function rupeesToPaisa(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new Error('rupeesToPaisa: not a finite number');
  return Math.round(rupees * PAISA_PER_RUPEE);
}

export function paisaToRupees(paisa: number): number {
  return paisa / PAISA_PER_RUPEE;
}

/** "Rs. 3,300" — whole rupees unless there is a paisa remainder. */
export function formatPaisa(paisa: number, options?: { withSymbol?: boolean }): string {
  const withSymbol = options?.withSymbol ?? true;
  const rupees = paisa / PAISA_PER_RUPEE;
  const hasFraction = paisa % PAISA_PER_RUPEE !== 0;
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(rupees);
  return withSymbol ? `Rs. ${formatted}` : formatted;
}

/** "Rs. 1,500 – Rs. 4,000" or "Rs. 1,500 se" when there is no upper bound. */
export function formatPaisaRange(minPaisa: number, maxPaisa?: number | null): string {
  if (maxPaisa == null || maxPaisa <= minPaisa) return `${formatPaisa(minPaisa)} se`;
  return `${formatPaisa(minPaisa)} – ${formatPaisa(maxPaisa)}`;
}

/**
 * Split a gross amount into platform commission and provider earnings.
 * Rate is basis points (1000 = 10%). Commission rounds down so the provider
 * is never short-changed by rounding.
 */
export function splitCommission(
  grossPaisa: number,
  rateBasisPoints: number,
): { commissionPaisa: number; providerEarningsPaisa: number } {
  if (grossPaisa < 0) throw new Error('splitCommission: gross cannot be negative');
  if (rateBasisPoints < 0 || rateBasisPoints > 10_000) {
    throw new Error('splitCommission: rate must be between 0 and 10000 basis points');
  }
  const commissionPaisa = Math.floor((grossPaisa * rateBasisPoints) / 10_000);
  return { commissionPaisa, providerEarningsPaisa: grossPaisa - commissionPaisa };
}

export function basisPointsToPercent(bp: number): number {
  return bp / 100;
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}
