// NexGain Bookings business types: categories, search, preset services and
// prices (pre-filled only for Australia). FAKE sign-ups only.
import { describe, expect, it } from '@jest/globals';

import { INDUSTRIES } from '@/data/industries';
import {
  BOOKING_CATEGORIES,
  BOOKING_TYPES,
  findBookingType,
  presetServices,
  searchBookingTypes,
} from '@/systems/bookings/constants/booking-business-types';
import { bookingServicesProblem, currencySymbol } from '@/systems/bookings/components/signup/step-booking-services';
import { EMPTY_SIGNUP } from '@/components/signup/types';

describe('booking business types', () => {
  it('every category ends with "Other – enter my own"', () => {
    for (const c of BOOKING_CATEGORIES) {
      expect(c.types.at(-1)).toMatchObject({ other: true, name: 'Other – enter my own', services: [] });
    }
  });

  it('has unique ids and no types that System One already has', () => {
    const ids = BOOKING_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const systemOne = new Set(INDUSTRIES.map((i) => i.name.toLowerCase()));
    expect(BOOKING_TYPES.filter((t) => systemOne.has(t.name.toLowerCase()))).toEqual([]);
  });

  it('searches by any word, in one category or all', () => {
    expect(searchBookingTypes('barb', null).map((t) => t.name)).toContain('Barber');
    expect(searchBookingTypes('barb', 'nails')).toEqual([]);
    expect(searchBookingTypes('', 'hair').length).toBe(BOOKING_CATEGORIES.find((c) => c.id === 'hair')!.types.length);
  });
});

describe('preset services', () => {
  it('fills AUD prices only in Australia', () => {
    const au = presetServices(['hair/barber'], 'AU');
    expect(au.find((s) => s.name === 'Skin Fade')).toMatchObject({ minutes: 45, price: 50, category: 'Barber', selected: true });
    expect(presetServices(['hair/barber'], 'GB').every((s) => s.price === null)).toBe(true);
    expect(presetServices(['hair/barber'], null).every((s) => s.price === null)).toBe(true);
  });

  it('adds "Do you also offer" types, without the same service twice', () => {
    const both = presetServices(['hair/barber', 'hair/hair-salon'], 'AU');
    expect(both.filter((s) => s.name === 'Kids Cut')).toHaveLength(1);
    expect(both.some((s) => s.category === 'Hair Salon')).toBe(true);
    expect(findBookingType('hair/other')?.other).toBe(true);
    expect(presetServices(['hair/other'], 'AU')).toEqual([]);
  });
});

describe('sign-up services step', () => {
  const ready = {
    ...EMPTY_SIGNUP,
    country: 'GB',
    ownerWorks: false,
    bookingServices: [{ key: 'a', name: 'Skin Fade', minutes: 45, price: 40, category: 'Barber', selected: true }],
  };
  it('needs a country, a ticked service with a price, and the owner’s answer', () => {
    expect(bookingServicesProblem(ready)).toBeNull();
    expect(bookingServicesProblem({ ...ready, country: '' })).toMatch(/country/);
    expect(bookingServicesProblem({ ...ready, ownerWorks: null })).toMatch(/work yourself/);
    expect(bookingServicesProblem({ ...ready, bookingServices: [{ ...ready.bookingServices[0], price: null }] })).toMatch(/price/);
    expect(bookingServicesProblem({ ...ready, bookingServices: [{ ...ready.bookingServices[0], selected: false }] })).toMatch(/at least one/);
  });
  it('shows the currency symbol', () => {
    expect(currencySymbol('AUD – Australian Dollar')).toBe('$');
    expect(currencySymbol('GBP – British Pound')).toBe('£');
    expect(currencySymbol('EUR – Euro')).toBe('€');
  });
});
