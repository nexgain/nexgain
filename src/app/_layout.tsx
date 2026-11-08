import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { EmailPreviewHost } from '@/components/email-preview';
import { Colors } from '@/constants/theme';
// Starts listening for logins so the signed-in person's business loads automatically.
import '@/lib/auth';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.accent,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
  },
};

// Root navigator: the landing screen plus the (owner) and (employee) sections.
// Each section owns its own layout inside its route group folder.
export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      {/* Preview before sending from a connected Gmail / Outlook account (src/lib/email.ts). */}
      <EmailPreviewHost />
    </ThemeProvider>
  );
}
