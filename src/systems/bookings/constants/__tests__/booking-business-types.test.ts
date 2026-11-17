// NexGain Bookings business types: categories, search, preset services and
// prices (pre-filled only for Australia). FAKE sign-ups only.
import { describe, expect, it } from '@jest/globals';

import { INDUSTRIES } from '@/data/industries';
import {
  BOOKING_CATEGORIES,
  BOOKING_TYPES,
  bookingWords,
  findBookingType,
  plural,
  presetServices,
  roleSuggestions,
  searchBookingTypes,
  titleCase,
  withArticle,
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

  it('only ever shows the one business type picked, never another type’s services', () => {
    const barber = presetServices(['hair/barber', 'hair/hair-salon'], 'AU');
    expect(barber.every((s) => s.category === 'Barber')).toBe(true);
    expect(barber.map((s) => s.name)).toContain('Beard Trim');
    expect(barber.map((s) => s.name)).not.toContain('Balayage');
    const beauty = presetServices(['beauty/beauty-therapist'], 'AU');
    expect(beauty.every((s) => s.category === 'Beauty Therapist')).toBe(true);
    expect(beauty.map((s) => s.name)).not.toContain('Gel Manicure');
    expect(findBookingType('hair/other')?.other).toBe(true);
    expect(presetServices(['hair/other'], 'AU')).toEqual([]);
    // An old id that no longer exists: no presets (it's never swapped for another type's).
    expect(presetServices(['beauty/beauty-salon-general'], 'AU')).toEqual([]);
  });

  it('gives every real type a full preset list, each service once', () => {
    for (const t of BOOKING_TYPES.filter((x) => !x.other)) {
      expect(t.services.length).toBeGreaterThanOrEqual(6);
      const names = t.services.map((s) => s.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
      for (const s of t.services) {
        expect(s.minutes).toBeGreaterThanOrEqual(5);
        expect(s.audPrice).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('wording for the business type', () => {
  it('names the people, bookings and customers', () => {
    expect(bookingWords(['hair/barber'])).toEqual({ staff: 'barber', booking: 'appointment', customer: 'client' });
    expect(bookingWords(['hair/hair-salon']).staff).toBe('stylist');
    expect(bookingWords(['body-art/tattoo-studio'])).toMatchObject({ staff: 'artist', booking: 'session' });
    expect(bookingWords(['health/physiotherapy'])).toMatchObject({ staff: 'physio', customer: 'patient' });
    expect(bookingWords(['fitness/yoga-studio'])).toMatchObject({ staff: 'instructor', booking: 'class' });
    // An old id falls back to its category; nothing saved = general words.
    expect(bookingWords(['beauty/beauty-salon-general']).staff).toBe('beauty therapist');
    expect(bookingWords([])).toEqual({ staff: 'team member', booking: 'appointment', customer: 'client' });
  });

  it('formats the words', () => {
    expect(titleCase('nail tech')).toBe('Nail Tech');
    expect(titleCase('lash & brow artist')).toBe('Lash & Brow Artist');
    expect(plural('barber')).toBe('barbers');
    expect(plural('class')).toBe('classes');
    expect(withArticle('appointment')).toBe('an appointment');
    expect(withArticle('session')).toBe('a session');
    expect(roleSuggestions(['hair/barber']).slice(0, 2)).toEqual(['Barber', 'Senior Barber']);
    expect(roleSuggestions([])[0]).toBe('Apprentice');
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
