import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Icon, IconBadge, type IconName } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import {
  deleteQualification,
  getQualificationStatus,
  loadQualifications,
  useQualifications,
  type Qualification,
  type QualificationStatus,
} from '@/data/qualifications';

const CERTIFICATE_ICON: IconName = {
  ios: 'rosette',
  android: 'workspace_premium',
  web: 'workspace_premium',
};

export default function QualificationsScreen() {
  const me = useCurrentEmployee();
  const qualifications = useQualifications(me?.id);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!me?.id) return;
    loadQualifications(me.id)
      .then(() => setLoadError(false))
      .catch(() => setLoadError(true));
  }, [me?.id]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/add-qualification')}
              accessibilityRole="button"
              accessibilityLabel="Add qualification"
              hitSlop={8}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color={C.primary} size={16} />
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          Upload and manage your licences, tickets and certificates. We&apos;ll remind you when
          they&apos;re expiring.
        </Text>

        {loadError && (
          <Text style={styles.error}>Couldn&apos;t load your qualifications. Check your internet connection.</Text>
        )}
        {qualifications === null ? (
          loadError ? null : <ActivityIndicator color={C.primary} />
        ) : qualifications.length === 0 ? (
          <Card style={styles.emptyCard}>
            <IconBadge name={CERTIFICATE_ICON} />
            <Text style={styles.emptyTitle}>No qualifications added yet</Text>
            <Text style={styles.emptyBody}>
              Tap &ldquo;+ Add&rdquo; to upload your first licence, ticket or certificate.
            </Text>
          </Card>
        ) : (
          qualifications.map((q) => <QualificationCard key={q.id} qualification={q} />)
        )}
      </ScrollView>
    </>
  );
}

const STATUS_COLORS: Record<QualificationStatus['tone'], { text: string; background: string }> = {
  valid: { text: C.success, background: C.successSoft },
  expiring: { text: '#B45309', background: '#FEF3C7' },
  expired: { text: C.danger, background: C.dangerSoft },
};

function QualificationCard({ qualification }: { qualification: Qualification }) {
  const status = getQualificationStatus(qualification.expiryDate);
  const colors = STATUS_COLORS[status.tone];
  const doc = qualification.document;

  async function remove() {
    try {
      await deleteQualification(qualification);
    } catch {
      Alert.alert('Couldn’t remove it', 'Check your internet connection and try again.');
    }
  }

  function showOptions() {
    if (Platform.OS === 'web') {
      if (doc?.uri) Linking.openURL(doc.uri);
      return;
    }
    Alert.alert(qualification.name, undefined, [
      ...(doc?.uri ? [{ text: 'Open File', onPress: () => Linking.openURL(doc.uri!) }] : []),
      { text: 'Remove', style: 'destructive' as const, onPress: remove },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <Pressable onPress={showOptions} accessibilityRole="button" accessibilityLabel={`${qualification.name} options`}>
    <Card style={styles.card}>
      <View style={styles.thumbnail}>
        {doc?.kind === 'image' && doc.uri ? (
          <Image source={{ uri: doc.uri }} style={styles.thumbnailImage} contentFit="cover" />
        ) : (
          <Icon
            name={
              doc?.kind === 'pdf'
                ? { ios: 'doc.richtext.fill', android: 'picture_as_pdf', web: 'picture_as_pdf' }
                : { ios: 'photo', android: 'image', web: 'image' }
            }
            color={C.textMuted}
            size={24}
          />
        )}
      </View>

      <View style={styles.cardText}>
        <Text style={styles.name} numberOfLines={2}>
          {qualification.name}
        </Text>
        <Text style={styles.expiry}>
          {qualification.expiryDate
            ? `Expires ${formatShortDate(qualification.expiryDate)}`
            : 'No expiry date'}
        </Text>
        <View style={[styles.badge, { backgroundColor: colors.background }]}>
          <Text style={[styles.badgeText, { color: colors.text }]}>{status.label}</Text>
        </View>
      </View>
    </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: Spacing.four - 4,
    gap: Spacing.three - 4,
  },
  description: {
    color: C.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: Spacing.two,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.two,
  },
  addButtonText: {
    color: C.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  error: {
    color: C.danger,
    fontSize: 14,
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: Radius.medium,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  cardText: {
    flex: 1,
    gap: 3,
    alignItems: 'flex-start',
  },
  name: {
    color: C.text,
    fontSize: 16,
    fontWeight: '600',
  },
  expiry: {
    color: C.textSecondary,
    fontSize: 13,
  },
  badge: {
    marginTop: 2,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
