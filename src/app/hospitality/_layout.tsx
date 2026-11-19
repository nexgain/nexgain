import { Stack } from 'expo-router';

// NexGain Hospitality (System 4): the owner and employee sections for cafes,
// restaurants and other food businesses. Everything lives under
// /hospitality/. Hospitality-only screens (Menu, Sales...) are in
// (owner)/ here and src/systems/hospitality; the rest (Payroll, Transactions,
// GST, Super, the employee side...) are the shared System 1 screens, whose
// links are kept under /hospitality/ by src/lib/nav.ts.
export default function HospitalityLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
