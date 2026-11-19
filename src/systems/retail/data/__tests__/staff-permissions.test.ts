// NexGain Retail staff: Scanner permissions and action messages. FAKE staff only.
import { describe, expect, it, jest } from '@jest/globals';

import { ACTION_LABELS, actionDoneText, DEFAULT_PERMISSIONS, STAFF_ACTIONS } from '@/systems/retail/data/staff-permissions';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('staff Scanner permissions', () => {
  it('lets new staff sell and take returns, nothing more, until the owner says so', () => {
    expect(DEFAULT_PERMISSIONS).toEqual({ sold: true, returned: true, received: false, damaged: false, count: false });
  });

  it('offers the five actions in the order on the Scanner', () => {
    expect(STAFF_ACTIONS.map((a) => ACTION_LABELS[a].label)).toEqual(['Sold', 'Received', 'Returned', 'Damaged', 'Count']);
  });

  it('says what happened and how many are left', () => {
    expect(actionDoneText('sold', 2, 'Classic Hoodie · M', 3)).toBe('Sold: 2 × Classic Hoodie · M. 3 left.');
    expect(actionDoneText('count', 7, 'Logo Cap', 7)).toBe('Counted 7 × Logo Cap. Stock is now 7.');
  });
});
