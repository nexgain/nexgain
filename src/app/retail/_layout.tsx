import { Stack } from 'expo-router';

// NexGain Retail (System 3): the owner and employee sections for shops and
// brands that sell products and track stock (clothing, chemists, gift shops...).
// They started as copies of System 1's (owner) and (employee) sections, so
// everything here lives under /retail/ and links only to other /retail/ pages.
// Shared code (login, Supabase, data) is used as-is; anything System 3 changes
// gets its own copy in src/systems/retail, so Systems 1 and 2 are never affected.
export default function RetailLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
