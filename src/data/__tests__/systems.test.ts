// NexGain's two systems: which industries use NexGain Bookings, and where
// owners and employees go after logging in. Uses FAKE businesses only.
import { describe, expect, it } from '@jest/globals';

import { findIndustry, INDUSTRIES, searchIndustries } from '@/data/industries';
import { homeFor, systemOf } from '@/data/systems';

const BOOKING_TYPES = [
  'Barber',
  'Hair Salon',
  'Nail Salon',
  'Beauty & Make-up Artist',
  'Lash & Brow',
  'Tattoo & Piercing',
  'Massage',
  'Day Spa',
  'Skin Clinic',
  'Physio',
  'Chiropractor',
  'Personal Trainer',
  'Fitness Classes & Studio',
  'Yoga & Pilates',
  'Dog Groomer',
  'Photographer',
  'Tutor',
  'Music Teacher',
  'Driving Instructor',
  'Other (needs bookings)',
];

describe('business types', () => {
  it('lists every booking business under NexGain Bookings', () => {
    const bookings = INDUSTRIES.filter((i) => i.system === 'bookings').map((i) => i.name);
    expect([...bookings].sort()).toEqual([...BOOKING_TYPES].sort());
  });

  it('takes the booking businesses out of the service list', () => {
    const service = INDUSTRIES.filter((i) => i.system === 'service').map((i) => i.name);
    for (const old of ['Barber', 'Hairdressing', 'Massage Therapy', 'Physiotherapy', 'Dog Grooming', 'Photography', 'Tutoring', 'Yoga Studio']) {
      expect(service).not.toContain(old);
    }
    // Service businesses stay as they were.
    expect(service).toEqual(expect.arrayContaining(['Carpentry', 'Plumbing', 'Electrical', 'Dog Walking', 'Mobile Hairdresser', 'Gym']));
  });

  it('searches only the chosen list', () => {
    expect(searchIndustries('barber', 8, 'bookings').map((i) => i.name)).toContain('Barber');
    expect(searchIndustries('barber', 8, 'service')).toEqual([]);
    expect(searchIndustries('plumb', 8, 'bookings')).toEqual([]);
    expect(searchIndustries('plumb', 8, 'service').map((i) => i.name)).toContain('Plumbing');
    // Old search words still find the new names.
    expect(searchIndustries('hairdresser', 8, 'bookings').map((i) => i.name)).toContain('Hair Salon');
    expect(searchIndustries('physiotherapy', 8, 'bookings').map((i) => i.name)).toContain('Physio');
  });

  it('gives booking businesses suggested services', () => {
    expect(findIndustry('Barber')?.services).toContain('Beard Trims');
    expect(findIndustry('Tattoo & Piercing')?.services).toContain('Ear Piercing');
  });
});

describe('which system opens after login', () => {
  const fakeServiceBusiness = { systemType: 'service' as const };
  const fakeBookingBusiness = { systemType: 'bookings' as const };

  it('opens System 1 for service businesses (and older ones with no setting)', () => {
    expect(homeFor('owner', fakeServiceBusiness)).toBe('/dashboard');
    expect(homeFor('employee', fakeServiceBusiness)).toBe('/home');
    expect(homeFor('owner', {})).toBe('/dashboard');
    expect(homeFor('owner', null)).toBe('/dashboard');
    expect(systemOf(undefined)).toBe('service');
  });

  it('opens NexGain Bookings for booking businesses, for the owner and their employees', () => {
    expect(homeFor('owner', fakeBookingBusiness)).toBe('/bookings/dashboard');
    expect(homeFor('employee', fakeBookingBusiness)).toBe('/bookings/home');
  });
});
