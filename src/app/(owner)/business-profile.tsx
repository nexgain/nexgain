import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, TextField } from '@/components/owner/form';
import { ScreenHeader, Segmented } from '@/components/owner/invoices-ui';
import { Button, Card, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { EMAIL_APPS, updateBusiness, useBusiness } from '@/data/business';
import { formatBsb } from '@/components/employee-signup/types';
import { updateBusinessPayment, useBusinessPayment } from '@/data/invoices';
import { emailAppHint } from '@/lib/email';

// Edit the business details set during owner sign-up: name and logo (printed on
// quotes and invoices), the email app they're sent from, and bank details for invoices.
export default function BusinessProfileScreen() {
  const business = useBusiness();
  const payment = useBusinessPayment();

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
            Quotes, invoices and receipts open in your email app, written and with the PDF attached. You just press Send.
          </Text>
          <FormField label="Email App">
            <Segmented options={EMAIL_APPS} value={business.emailApp} onChange={(emailApp) => updateBusiness({ emailApp })} />
          </FormField>
          <Text style={styles.muted}>{emailAppHint(business.emailApp)}</Text>
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
    backgroundColor: '#FFFFFF',
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
