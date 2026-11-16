import { Stack } from 'expo-router';

// NexGain Bookings (System 2): the owner and employee sections for booking
// businesses (barbers, salons...). They started as copies of System 1's
// (owner) and (employee) sections, so everything here lives under /bookings/
// and links only to other /bookings/ pages. Shared code (login, Supabase,
// data) is used as-is; anything System 2 changes gets its own copy in
// src/systems/bookings, so System 1 is never affected.
export default function BookingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
