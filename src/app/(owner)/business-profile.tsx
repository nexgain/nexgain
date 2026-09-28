import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, TextField } from '@/components/owner/form';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Button, Card, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { updateBusinessProfile, useBusinessProfile } from '@/data/invoices';

// The business name and logo printed at the top of quote PDFs.
export default function BusinessProfileScreen() {
  const profile = useBusinessProfile();

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
    if (logo) updateBusinessProfile({ logo });
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Business Profile" onBack={() => router.navigate('/menu')} />

      <Card title="Business Details">
        <Text style={styles.muted}>Shown in the top right corner of every quote you send.</Text>
        <FormField label="Business Name">
          <TextField
            value={profile.name}
            onChangeText={(name) => updateBusinessProfile({ name })}
            placeholder="e.g. Smith Plumbing"
            accessibilityLabel="Business Name"
            autoCapitalize="words"
          />
        </FormField>

        <FormField label="Logo">
          {profile.logo ? (
            <View style={styles.logoRow}>
              <Image source={{ uri: profile.logo }} style={styles.logo} contentFit="contain" accessibilityLabel="Business logo" />
              <View style={styles.logoActions}>
                <Button label="Change Logo" variant="secondary" onPress={pickLogo} />
                <Pressable onPress={() => updateBusinessProfile({ logo: null })} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.removeText}>Remove Logo</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Button label="Upload Logo" variant="secondary" onPress={pickLogo} />
          )}
        </FormField>
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
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
