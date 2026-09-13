import { describe, expect, it } from 'vitest';
import {
  formatPaisa,
  formatPaisaRange,
  paisaToRupees,
  percentToBasisPoints,
  rupeesToPaisa,
  splitCommission,
} from '@/lib/money';

/**
 * Money arithmetic.
 *
 * Commission is the platform's revenue and the provider's income, so the
 * rounding direction is a business decision, not an implementation detail:
 * commission rounds down so the provider is never short-changed.
 */
describe('money', () => {
  it('converts rupees to paisa without float drift', () => {
    expect(rupeesToPaisa(3300)).toBe(330_000);
    expect(rupeesToPaisa(0.1)).toBe(10);
    // 19.99 * 100 is 1998.9999... in binary floating point.
    expect(rupeesToPaisa(19.99)).toBe(1999);
    expect(paisaToRupees(330_000)).toBe(3300);
  });

  it('formats Pakistani rupees with grouping', () => {
    expect(formatPaisa(330_000)).toBe('Rs. 3,300');
    expect(formatPaisa(0)).toBe('Rs. 0');
    expect(formatPaisa(150_050)).toBe('Rs. 1,500.50');
    expect(formatPaisa(330_000, { withSymbol: false })).toBe('3,300');
  });

  it('formats an open-ended range as "se"', () => {
    expect(formatPaisaRange(150_000, 800_000)).toBe('Rs. 1,500 – Rs. 8,000');
    expect(formatPaisaRange(150_000, null)).toBe('From Rs. 1,500');
    // A max at or below the min is not a range.
    expect(formatPaisaRange(150_000, 150_000)).toBe('From Rs. 1,500');
  });

  it('splits commission at 10% of the example from the brief', () => {
    // Booking total Rs. 5,000 at 10% => platform Rs. 500, provider Rs. 4,500.
    const result = splitCommission(500_000, 1000);
    expect(result.commissionPaisa).toBe(50_000);
    expect(result.providerEarningsPaisa).toBe(450_000);
  });

  it('rounds commission down so the provider is never short-changed', () => {
    // 333 paisa at 10% is 33.3 paisa.
    const result = splitCommission(333, 1000);
    expect(result.commissionPaisa).toBe(33);
    expect(result.providerEarningsPaisa).toBe(300);
    // The split always reconstitutes the gross exactly.
    expect(result.commissionPaisa + result.providerEarningsPaisa).toBe(333);
  });

  it('handles the boundary rates', () => {
    expect(splitCommission(100_000, 0)).toEqual({
      commissionPaisa: 0,
      providerEarningsPaisa: 100_000,
    });
    expect(splitCommission(100_000, 10_000)).toEqual({
      commissionPaisa: 100_000,
      providerEarningsPaisa: 0,
    });
  });

  it('rejects impossible inputs rather than producing nonsense', () => {
    expect(() => splitCommission(-1, 1000)).toThrow();
    expect(() => splitCommission(100, -1)).toThrow();
    expect(() => splitCommission(100, 10_001)).toThrow();
    expect(() => rupeesToPaisa(Number.NaN)).toThrow();
  });

  it('converts percent to basis points', () => {
    expect(percentToBasisPoints(10)).toBe(1000);
    expect(percentToBasisPoints(2.5)).toBe(250);
  });
});
