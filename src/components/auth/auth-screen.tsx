import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AuthColors as C } from '@/components/auth/theme';

const LOGO = require('@/assets/nexgain-logo.png');
const LOGO_RATIO = 978 / 634; // width / height of the logo image

/** Shared layout for the start screens: background glow, logo, optional back arrow, safe areas and keyboard handling. */
export function AuthScreen({
  children,
  showBack = false,
  logoSize = 'small',
}: {
  children: ReactNode;
  showBack?: boolean;
  logoSize?: 'large' | 'small';
}) {
  return (
    <View style={styles.root}>
      <BackgroundGlow />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              {showBack && (
                <Pressable
                  onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  hitSlop={10}
                  style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
                  <SymbolView
                    name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                    tintColor={C.text}
                    size={18}
                  />
                </Pressable>
              )}
            </View>
            <View style={styles.content}>
              <Image
                source={LOGO}
                style={[styles.logo, logoSize === 'large' ? styles.logoLarge : styles.logoSmall]}
                contentFit="contain"
                accessibilityLabel="NexGain"
              />
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** Soft green and blue glows behind the content. */
function BackgroundGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <RadialGradient id="green" cx="50%" cy="8%" rx="75%" ry="40%">
          <Stop offset="0" stopColor={C.brand} stopOpacity="0.14" />
          <Stop offset="1" stopColor={C.brand} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="blue" cx="100%" cy="100%" rx="80%" ry="45%">
          <Stop offset="0" stopColor="#2563EB" stopOpacity="0.10" />
          <Stop offset="1" stopColor="#2563EB" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#green)" />
      <Rect width="100%" height="100%" fill="url(#blue)" />
    </Svg>
  );
}

/** Placeholder for features that aren't built yet (sign up, password reset). */
export function comingSoon(feature: string) {
  const message = `${feature} is coming soon.`;
  if (Platform.OS === 'web') {
    window.alert(message);
  } else {
    Alert.alert('Coming soon', message);
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  topBar: {
    height: 52,
    justifyContent: 'center',
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
  logo: {
    alignSelf: 'center',
    aspectRatio: LOGO_RATIO,
  },
  logoLarge: {
    width: '80%',
    maxWidth: 320,
  },
  logoSmall: {
    width: '46%',
    maxWidth: 190,
  },
  content: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: 16,
  },
});
