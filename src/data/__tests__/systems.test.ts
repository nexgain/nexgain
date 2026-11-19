// NexGain's two systems: the service industry list, and where
// owners and employees go after logging in. Uses FAKE businesses only.
import { describe, expect, it } from '@jest/globals';

import { findIndustry, INDUSTRIES, searchIndustries } from '@/data/industries';
import { homeFor, systemOf } from '@/data/systems';

describe('business types', () => {
  it('keeps booking businesses out of the service list (they have their own list)', () => {
    expect(INDUSTRIES.every((i) => i.system === 'service')).toBe(true);
    expect(searchIndustries('barber', 8, 'bookings')).toEqual([]);
    expect(findIndustry('Barber')).toBeNull();
  });

  it('leaves the service businesses as they were', () => {
    const service = INDUSTRIES.map((i) => i.name);
    expect(service).toEqual(expect.arrayContaining(['Carpentry', 'Plumbing', 'Electrical', 'Dog Walking', 'Mobile Hairdresser', 'Gym']));
    expect(searchIndustries('plumb', 8, 'service').map((i) => i.name)).toContain('Plumbing');
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

  it('opens NexGain Retail for retail businesses, for the owner and their employees', () => {
    const fakeRetailBusiness = { systemType: 'retail' as const };
    expect(systemOf(fakeRetailBusiness)).toBe('retail');
    expect(homeFor('owner', fakeRetailBusiness)).toBe('/retail/dashboard');
    expect(homeFor('employee', fakeRetailBusiness)).toBe('/retail/home');
  });
});
