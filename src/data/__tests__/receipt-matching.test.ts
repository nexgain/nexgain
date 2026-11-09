// Linking a receipt photo to the right bank transaction, from what the AI read off it.
import { describe, expect, it } from '@jest/globals';

import { pickReceiptMatch, sameSupplier, type MatchCandidate } from '../../../supabase/functions/_shared/receipt-match';

const txn = (id: string, date: string, amount: number, description: string, merchant: string | null = null): MatchCandidate => ({
  id,
  date,
  amount,
  merchant,
  description,
});

describe('supplier names', () => {
  it('finds the receipt’s supplier in the bank line', () => {
    expect(sameSupplier('Bunnings Warehouse Pty Ltd', txn('a', '2026-11-09', -50, 'BUNNINGS 6342 CAPALABA'))).toBe(true);
    expect(sameSupplier('Shell Coles Express', txn('a', '2026-11-09', -50, 'SHELL COLES EXPRESS WYNNUM'))).toBe(true);
    expect(sameSupplier('Bunnings Warehouse', txn('a', '2026-11-09', -50, 'SHELL COLES EXPRESS WYNNUM'))).toBe(false);
    expect(sameSupplier(null, txn('a', '2026-11-09', -50, 'BUNNINGS'))).toBe(false);
  });
});

describe('picking the transaction', () => {
  const receipt = { total: 50, date: '2026-11-09', supplier: 'Bunnings Warehouse' };

  it('matches one clear purchase with the same amount and date', () => {
    expect(pickReceiptMatch(receipt, [txn('a', '2026-11-10', -50, 'BUNNINGS 6342')])).toEqual({ kind: 'match', id: 'a' });
  });

  it('uses the supplier when two $50 purchases happened the same day', () => {
    const pick = pickReceiptMatch(receipt, [txn('shell', '2026-11-09', -50, 'SHELL COLES EXPRESS'), txn('bunnings', '2026-11-09', -50, 'BUNNINGS 6342 CAPALABA')]);
    expect(pick).toEqual({ kind: 'match', id: 'bunnings' });
  });

  it('asks when it really can’t tell (same amount, same day, no supplier match)', () => {
    const pick = pickReceiptMatch({ ...receipt, supplier: 'Joe’s Hardware' }, [txn('x', '2026-11-09', -50, 'EFTPOS 1234'), txn('y', '2026-11-09', -50, 'EFTPOS 5678')]);
    expect(pick.kind).toBe('suggest');
  });

  it('allows a card surcharge when the supplier matches', () => {
    expect(pickReceiptMatch({ ...receipt, total: 100 }, [txn('a', '2026-11-09', -101.5, 'BUNNINGS 6342')])).toEqual({ kind: 'match', id: 'a' });
    // ...but not for a different shop.
    expect(pickReceiptMatch({ ...receipt, total: 100 }, [txn('b', '2026-11-09', -101.5, 'SHELL WYNNUM')])).toEqual({ kind: 'none' });
  });

  it('matches a receipt with no date only when the amount and supplier both fit one purchase', () => {
    expect(pickReceiptMatch({ ...receipt, date: null }, [txn('a', '2026-10-20', -50, 'BUNNINGS 6342')])).toEqual({ kind: 'match', id: 'a' });
    expect(pickReceiptMatch({ ...receipt, date: null }, [txn('a', '2026-10-20', -50, 'EFTPOS 1234')]).kind).toBe('suggest');
  });

  it('doesn’t match a purchase from long after the receipt', () => {
    expect(pickReceiptMatch(receipt, [txn('a', '2026-11-17', -50, 'EFTPOS 1234')]).kind).toBe('suggest');
  });
});
