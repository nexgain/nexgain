import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, SwitchRow, TextField } from '@/components/owner/form';
import { ScreenHeader, Segmented } from '@/components/owner/invoices-ui';
import { SuperSettingsCard } from '@/components/owner/super-settings-card';
import { Button, Card, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { EMAIL_APP_CHOICES, shownEmailApp, updateBusiness, useBusiness } from '@/data/business';
import { formatBsb } from '@/components/employee-signup/types';
import { EMAIL_PROVIDER, findAccount, useConnectedAccounts } from '@/data/connected-accounts';
import { updateBusinessPayment, useBusinessPayment } from '@/data/invoices';
import { emailAppHint } from '@/lib/email';
import { businessUsesSuper } from '@/data/super-rules';

// Edit the business details set during owner sign-up: name and logo (printed on
// quotes and invoices), the email app they're sent from, bank details for invoices,
// and super settings.
export default function BusinessProfileScreen() {
  const business = useBusiness();
  const payment = useBusinessPayment();
  const accounts = useConnectedAccounts();
  const sendingFrom = business ? findAccount(accounts, EMAIL_PROVIDER[shownEmailApp(business.emailApp)]) : undefined;

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.6,
      // PDFs can't read files from the phone, so keep the image itself as text.
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const logo = asset.base64
      ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
      : asset.uri.startsWith('data:')
        ? asset.uri
        : null;
    if (logo) updateBusiness({ logo });
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Business Profile" />

      {!business ? (
        <Card title="Business Details">
          <Text style={styles.muted}>Finish owner sign-up to add your business name and logo.</Text>
          <Button label="Go to Sign-Up" onPress={() => router.navigate('/owner-signup')} />
        </Card>
      ) : (
        <Card title="Business Details">
          <Text style={styles.muted}>Shown in the top right corner of every quote you send.</Text>
          <FormField label="Business Name">
            <TextField
              value={business.businessName}
              onChangeText={(businessName) => updateBusiness({ businessName })}
              placeholder="e.g. Smith Plumbing"
              accessibilityLabel="Business Name"
              autoCapitalize="words"
            />
          </FormField>

          <FormField label="Business Phone">
            <TextField
              value={business.phone}
              onChangeText={(phone) => updateBusiness({ phone })}
              placeholder="e.g. 0412 345 678"
              keyboardType="phone-pad"
              accessibilityLabel="Business Phone"
            />
            <Text style={styles.muted}>Included in the job reminders your clients get.</Text>
          </FormField>

          <FormField label="Logo">
            {business.logo ? (
              <View style={styles.logoRow}>
                <Image source={{ uri: business.logo }} style={styles.logo} contentFit="contain" accessibilityLabel="Business logo" />
                <View style={styles.logoActions}>
                  <Button label="Change Logo" variant="secondary" onPress={pickLogo} />
                  <Pressable onPress={() => updateBusiness({ logo: null })} accessibilityRole="button" hitSlop={8}>
                    <Text style={styles.removeText}>Remove Logo</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Button label="Upload Logo" variant="secondary" onPress={pickLogo} />
            )}
          </FormField>
        </Card>
      )}

      {business && (
        <Card title="Sending Quotes & Invoices" icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}>
          <Text style={styles.muted}>
            Quotes, invoices and receipts go from your own email address with the PDF attached. Connect Gmail or Outlook in
            More › Integrations to send them straight from the app.
          </Text>
          <FormField label="Email App">
            <Segmented options={EMAIL_APP_CHOICES} value={shownEmailApp(business.emailApp)} onChange={(emailApp) => updateBusiness({ emailApp })} />
          </FormField>
          <Text style={styles.muted}>{emailAppHint(business.emailApp, sendingFrom?.email)}</Text>
          <FormField label="Business Email">
            <TextField
              value={business.businessEmail}
              onChangeText={(businessEmail) => updateBusiness({ businessEmail })}
              placeholder={business.email || 'e.g. hello@smithplumbing.com.au'}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Business Email"
            />
          </FormField>
        </Card>
      )}

      {business && (
        <Card title="Bank Details" icon={OwnerIcons.bank}>
          <Text style={styles.muted}>Printed on every invoice so customers can pay you by bank transfer.</Text>
          <FormField label="Account Name">
            <TextField
              value={payment.accountName}
              onChangeText={(accountName) => updateBusinessPayment({ accountName })}
              placeholder="e.g. Smith Plumbing Pty Ltd"
              autoCapitalize="words"
              accessibilityLabel="Account Name"
            />
          </FormField>
          <View style={styles.row}>
            <FormField label="BSB" style={styles.flex}>
              <TextField
                value={payment.bsb}
                onChangeText={(bsb) => updateBusinessPayment({ bsb: formatBsb(bsb) })}
                placeholder="000-000"
                keyboardType="number-pad"
                accessibilityLabel="BSB"
              />
            </FormField>
            <FormField label="Account Number" style={styles.flex}>
              <TextField
                value={payment.account}
                onChangeText={(account) => updateBusinessPayment({ account })}
                placeholder="12345678"
                keyboardType="number-pad"
                accessibilityLabel="Account Number"
              />
            </FormField>
          </View>
          <FormField label="Bank (optional)">
            <TextField
              value={payment.bank}
              onChangeText={(bank) => updateBusinessPayment({ bank })}
              placeholder="e.g. Commonwealth Bank"
              accessibilityLabel="Bank"
            />
          </FormField>
        </Card>
      )}

      {/* GST: Australian businesses only. Turning it off hides every GST feature. */}
      {business && businessUsesSuper(business) && (
        <Card title="GST" icon={OwnerIcons.receipt}>
          <SwitchRow
            label="Registered for GST"
            hint={
              business.gstRegistered
                ? 'GST (10%) is added to new quotes and invoices, and the GST page tracks each quarter.'
                : 'No GST on quotes and invoices, and the GST page and reminders are hidden.'
            }
            value={business.gstRegistered}
            onChange={(gstRegistered) => updateBusiness({ gstRegistered })}
          />
          <Text style={styles.muted}>Quotes and invoices already made keep the GST they were made with.</Text>
        </Card>
      )}

      <SuperSettingsCard />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  flex: {
    flex: 1,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: Radius.medium,
    backgroundColor: C.surface,
  },
  logoActions: {
    flex: 1,
    gap: Spacing.three - 4,
    alignItems: 'flex-start',
  },
  removeText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '600',
  },
});
