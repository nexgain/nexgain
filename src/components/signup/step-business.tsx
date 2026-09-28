import { useState } from 'react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Icon, Input, SignupColors as C } from '@/components/signup/fields';
import { IndustrySearch } from '@/components/signup/industry-search';
import type { StepProps } from '@/components/signup/types';

// Keeps the saved logo small enough to store on the phone (~1.5 MB as text).
const MAX_LOGO_CHARS = 2_000_000;

/** Formats up to 11 digits as "12 345 678 901". */
function formatAbn(text: string) {
  const d = text.replace(/\D/g, '').slice(0, 11);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 11)].filter(Boolean).join(' ');
}

export function StepBusiness({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const abnDigits = data.abn.replace(/\D/g, '');
  const errors = {
    businessName: !data.businessName.trim() && 'Enter your business name.',
    abn: abnDigits.length > 0 && abnDigits.length !== 11 && 'An ABN has 11 digits.',
    industry: !data.industry && 'Search for your industry and choose one from the list (or use your own).',
  };

  async function pickLogo() {
    setLogoError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? (asset.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(mime)) {
      setLogoError('Please choose a PNG or JPG image.');
      return;
    }
    const dataUri = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri.startsWith('data:') ? asset.uri : null;
    if (!dataUri) {
      setLogoError("That image couldn't be read. Please try another one.");
      return;
    }
    if (dataUri.length > MAX_LOGO_CHARS) {
      setLogoError('That image is too large. Please choose a smaller one.');
      return;
    }
    update({ logo: dataUri });
  }

  return (
    <>
      <Field label="Business name" error={tried && errors.businessName}>
        <Input
          value={data.businessName}
          onChangeText={(businessName) => update({ businessName })}
          placeholder="e.g. Smith Carpentry"
          autoCapitalize="words"
          accessibilityLabel="Business name"
          icon={{ ios: 'building.2', android: 'business', web: 'business' }}
          hasError={tried && !!errors.businessName}
        />
      </Field>

      <Field label="Upload logo" optional error={logoError ?? undefined} hint="PNG or JPG">
        {data.logo ? (
          <View style={styles.logoPreview}>
            <Image source={{ uri: data.logo }} style={styles.logoImage} contentFit="contain" />
            <Text style={styles.logoText}>Logo added</Text>
            <Pressable
              onPress={() => update({ logo: null })}
              accessibilityRole="button"
              accessibilityLabel="Remove logo"
              hitSlop={8}
              style={styles.logoRemove}>
              <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color="#FFFFFF" size={11} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={pickLogo}
            accessibilityRole="button"
            accessibilityLabel="Upload logo"
            style={({ pressed }) => [styles.upload, pressed && styles.pressed]}>
            <Icon name={{ ios: 'photo.badge.plus', android: 'upload', web: 'upload' }} color={C.primary} size={22} />
            <Text style={styles.uploadTitle}>Tap to upload your logo</Text>
          </Pressable>
        )}
      </Field>

      <Field label="ABN" optional error={tried && errors.abn}>
        <Input
          value={data.abn}
          onChangeText={(t) => update({ abn: formatAbn(t) })}
          placeholder="12 345 678 901"
          keyboardType="number-pad"
          accessibilityLabel="ABN"
          icon={{ ios: 'number', android: 'tag', web: 'tag' }}
          hasError={tried && !!errors.abn}
        />
      </Field>

      <Field label="Business industry" error={tried && errors.industry}>
        <IndustrySearch
          text={data.industryText}
          selected={data.industry}
          onChangeText={(industryText) =>
            update({
              industryText,
              // Typing again clears the previous choice until a new one is picked.
              industry: data.industry && data.industry.name === industryText ? data.industry : null,
            })
          }
          onSelect={(industry) => update({ industry, industryText: industry.name })}
          hasError={tried && !!errors.industry}
        />
      </Field>

      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (!Object.values(errors).some(Boolean)) onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  upload: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 22,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B9CCF5',
    backgroundColor: C.primarySoft,
  },
  uploadTitle: {
    color: C.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  logoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  logoText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  logoRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.textSecondary,
  },
});
