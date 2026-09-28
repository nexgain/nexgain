import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { codeFromLink, type EmployeeStepProps } from '@/components/employee-signup/types';
import { Button, Field, fieldStyles, Icon, Input, SignupColors as C } from '@/components/signup/fields';
import { categoryIcon } from '@/data/industries';
import { findBusinessByCode } from '@/lib/employee-signup';

type Lookup = 'idle' | 'checking' | 'found' | 'not-found' | 'offline';

export function StepJoin({ data, update, onNext, nextLabel }: EmployeeStepProps) {
  const code = data.joinMode === 'code' ? data.code.trim() : (codeFromLink(data.link) ?? '');
  const alreadyFound = !!data.business && data.businessCode === code;
  // Result of the latest lookup, remembered with the code it was for.
  const [result, setResult] = useState<{ code: string; status: Lookup } | null>(null);
  const [tried, setTried] = useState(false);
  const lookup: Lookup = alreadyFound
    ? 'found'
    : code.length < 4
      ? 'idle'
      : result?.code === code
        ? result.status
        : 'checking';

  // Check the code a moment after typing stops.
  useEffect(() => {
    if (alreadyFound || code.length < 4) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const business = await findBusinessByCode(code);
        if (cancelled) return;
        update({ business, businessCode: business ? code : null });
        setResult({ code, status: business ? 'found' : 'not-found' });
      } catch {
        if (!cancelled) setResult({ code, status: 'offline' });
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when the code itself changes
  }, [code]);

  const business = alreadyFound ? data.business : null;

  function switchMode(joinMode: 'code' | 'link') {
    if (joinMode !== data.joinMode) update({ joinMode });
  }

  return (
    <>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['code', 'link'] as const).map((mode) => {
          const selected = data.joinMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => switchMode(mode)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabSelected]}>
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                {mode === 'code' ? 'Enter code' : 'Use invite link'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {data.joinMode === 'code' ? (
        <Field label="Business code" hint="Ask your employer for their NexGain business code.">
          <Input
            value={data.code}
            onChangeText={(t) => update({ code: t.toUpperCase().replace(/[^A-Z0-9-]/g, '') })}
            placeholder="e.g. BUXTON2026"
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Business code"
            icon={{ ios: 'number', android: 'tag', web: 'tag' }}
            hasError={lookup === 'not-found'}
          />
        </Field>
      ) : (
        <Field
          label="Invite link"
          hint={data.link && !codeFromLink(data.link) ? undefined : 'Paste the invite link your employer sent you.'}
          error={data.link.trim() && !codeFromLink(data.link) ? "That doesn't look like a NexGain invite link." : undefined}>
          <Input
            value={data.link}
            onChangeText={(link) => update({ link })}
            placeholder="nexgain://join/…"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Invite link"
            icon={{ ios: 'link', android: 'link', web: 'link' }}
          />
        </Field>
      )}

      {lookup === 'checking' && (
        <View style={styles.status}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.muted}>Looking up {code}…</Text>
        </View>
      )}
      {lookup === 'not-found' && (
        <View style={[styles.status, styles.errorBox]} accessibilityRole="alert">
          <Icon name={{ ios: 'xmark.octagon.fill', android: 'error', web: 'error' }} color={C.danger} size={16} />
          <Text style={styles.errorText}>We couldn&apos;t find a business with that code. Check with your employer.</Text>
        </View>
      )}
      {lookup === 'offline' && (
        <Text style={styles.errorText}>Can&apos;t check the code right now. Check your internet connection and try again.</Text>
      )}

      {business && (
        <View style={[fieldStyles.card, styles.businessCard]}>
          <View style={styles.found}>
            <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} color={C.done} size={16} />
            <Text style={styles.foundText}>Business found</Text>
          </View>
          <View style={styles.businessRow}>
            <View style={styles.logo}>
              {business.logo ? (
                <Image source={{ uri: business.logo }} style={styles.logoImage} contentFit="cover" />
              ) : (
                <Icon name={categoryIcon(business.industryCategory)} color={C.primary} size={22} />
              )}
            </View>
            <View style={fieldStyles.flex}>
              <Text style={styles.businessName}>{business.name}</Text>
              {business.industry ? <Text style={styles.muted}>{business.industry}</Text> : null}
              {business.industryCategory ? <Text style={styles.muted}>{business.industryCategory}</Text> : null}
            </View>
          </View>
        </View>
      )}

      {tried && !business && lookup !== 'checking' && lookup !== 'not-found' && (
        <Text style={styles.errorText}>Enter your employer&apos;s business code to continue.</Text>
      )}

      <Button
        label={nextLabel}
        arrow
        disabled={!business}
        onPress={() => {
          setTried(true);
          if (business) onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabSelected: {
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 3px rgba(15, 23, 42, 0.12)',
  },
  tabText: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextSelected: {
    color: C.primary,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    flex: 1,
    color: C.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 14,
  },
  businessCard: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  foundText: {
    color: C.done,
    fontSize: 13,
    fontWeight: '700',
  },
  businessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  businessName: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
});
