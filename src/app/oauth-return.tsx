import { useEffect } from 'react';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

// Web: this page loads in the login pop-up; hand the result back to the app window.
WebBrowser.maybeCompleteAuthSession();

/**
 * Where Google / Microsoft logins come back to (see connectAccount() in
 * src/data/connected-accounts.ts). The in-app login reads the result itself;
 * on Android the link also opens this screen, so it just steps back to where
 * the owner was (Integrations or sign-up).
 */
export default function OAuthReturnScreen() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
