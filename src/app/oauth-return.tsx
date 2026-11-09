import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { loadBank } from '@/data/bank';
import { loadConnectedAccounts, noteOAuthReturn } from '@/data/connected-accounts';

// Web: this page loads in the login pop-up; hand the result back to the app window.
WebBrowser.maybeCompleteAuthSession();

/**
 * Where Google / Microsoft logins come back to (see connectAccount() in
 * src/data/connected-accounts.ts). The in-app login reads the result itself;
 * on Android the link also opens this screen, so it just steps back to where
 * the owner was (Integrations or sign-up).
 */
export default function OAuthReturnScreen() {
  const params = useLocalSearchParams<Record<string, string>>();

  useEffect(() => {
    // A login finished in another browser (e.g. Chrome) arrives here: keep its result
    // for the in-app login, and refresh what's connected.
    if (params.status) {
      noteOAuthReturn(params);
      if (params.kind === 'bank') loadBank().catch(() => {});
      else loadConnectedAccounts().catch(() => {});
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
    // Runs once, for the link that opened this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
