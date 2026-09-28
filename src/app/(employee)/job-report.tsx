import { useState } from 'react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Icon, IconBadge, Icons } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { dateKey, formatShiftTime, getShiftForDate } from '@/data/employee-roster';
import { employeeFullName } from '@/data/employees';
import { JOB_OUTCOMES, REPORT_TEXT_LIMIT, submitJobReport, type JobOutcome } from '@/data/job-reports';
import { useShifts } from '@/data/shifts';

const MAX_PHOTOS = 10;

const OUTCOME_COLORS: Record<JobOutcome, { text: string; soft: string }> = {
  'Went well': { text: C.success, soft: C.successSoft },
  'Minor issues': { text: '#B45309', soft: '#FEF3C7' },
  "Didn't go well": { text: C.danger, soft: C.dangerSoft },
};

export default function JobReportScreen() {
  const currentEmployee = useCurrentEmployee();
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const shiftDate = date ?? dateKey(new Date());
  const employeeId = currentEmployee?.id ?? null;
  const day = getShiftForDate(shiftDate, new Date(), { shifts: useShifts(), employeeId });
  const shift = day?.shift ?? null;
  const dayDate = day?.date ?? new Date();

  const [outcome, setOutcome] = useState<JobOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [issues, setIssues] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<'no' | 'tried' | 'done'>('no');

  const dateText = dayDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  function addPhotoUris(uris: string[]) {
    setPhotos((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
  }

  async function chooseFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.7,
    });
    if (!result.canceled) addPhotoUris(result.assets.map((a) => a.uri));
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Camera access is needed to take photos. You can still choose from your library.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) addPhotoUris(result.assets.map((a) => a.uri));
  }

  function addPhotos() {
    setPhotoError(null);
    if (photos.length >= MAX_PHOTOS) {
      setPhotoError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    if (Platform.OS === 'web') {
      chooseFromLibrary();
      return;
    }
    Alert.alert('Add photos', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: chooseFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function submit() {
    if (!outcome) {
      setSubmitted('tried');
      return;
    }
    submitJobReport({
      employeeId,
      employeeName: currentEmployee ? employeeFullName(currentEmployee) : null,
      date: shiftDate,
      jobTitle: shift?.role ?? null,
      location: shift?.location ?? null,
      time: shift ? `${dateText} · ${formatShiftTime(shift)}` : dateText,
      outcome,
      notes: notes.trim(),
      issues: issues.trim(),
      photos,
      completed,
    });
    setSubmitted('done');
  }

  if (submitted === 'done') {
    return (
      <View style={[styles.screen, styles.doneScreen]}>
        <Card style={styles.doneCard}>
          <IconBadge name={Icons.checked} color={C.success} background={C.successSoft} />
          <Text style={styles.doneTitle}>Report submitted</Text>
          <Text style={styles.doneText}>
            Thanks! Your report has been sent to your manager
            {outcome !== 'Went well' || issues.trim() ? ' and flagged for their attention.' : '.'}
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.submit, styles.doneButton, pressed && styles.pressed]}>
            <Text style={styles.submitText}>Back to shift</Text>
          </Pressable>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.summary}>
          <IconBadge name={Icons.work} />
          <View style={styles.flex}>
            <Text style={styles.jobTitle}>{shift?.role ?? 'No job assigned'}</Text>
            <View style={styles.metaRow}>
              <Icon name={Icons.location} color={C.textSecondary} size={12} />
              <Text style={styles.meta}>{shift?.location || 'No address'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Icon name={Icons.clock} color={C.textSecondary} size={12} />
              <Text style={styles.meta}>
                {dateText}
                {shift ? ` · ${formatShiftTime(shift)}` : ''}
              </Text>
            </View>
          </View>
        </Card>

        <Section label="Job outcome">
          <View style={styles.pills}>
            {JOB_OUTCOMES.map((o) => {
              const selected = outcome === o;
              const colors = OUTCOME_COLORS[o];
              return (
                <Pressable
                  key={o}
                  onPress={() => setOutcome(o)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.pill,
                    { borderColor: selected ? colors.text : C.border, backgroundColor: selected ? colors.soft : C.card },
                  ]}>
                  <View style={[styles.pillDot, { backgroundColor: colors.text }]} />
                  <Text style={[styles.pillText, selected && { color: colors.text }]}>{o}</Text>
                </Pressable>
              );
            })}
          </View>
          {submitted === 'tried' && !outcome && <Text style={styles.error}>Choose how the job went.</Text>}
        </Section>

        <Section label="Job notes">
          <LimitedText
            value={notes}
            onChange={setNotes}
            placeholder="Write a summary of how the job went..."
            label="Job notes"
          />
        </Section>

        <Section label="Issues (optional)">
          <LimitedText
            value={issues}
            onChange={setIssues}
            placeholder="Describe any issues, problems or things the owner should know about..."
            label="Issues"
          />
        </Section>

        <Section label="Photos">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
            {photos.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.photo}>
                <Image source={{ uri }} style={styles.photoImage} contentFit="cover" />
                <Pressable
                  onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  hitSlop={6}
                  style={styles.photoRemove}>
                  <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color="#FFFFFF" size={10} />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={addPhotos}
              accessibilityRole="button"
              accessibilityLabel="Add photos"
              style={({ pressed }) => [styles.addPhoto, pressed && styles.pressed]}>
              <Icon name={{ ios: 'camera.fill', android: 'add_a_photo', web: 'add_a_photo' }} color={C.primary} size={20} />
              <Text style={styles.addPhotoText}>Add photos</Text>
            </Pressable>
          </ScrollView>
          {photoError && <Text style={styles.error}>{photoError}</Text>}
        </Section>

        <Section label="Sign off">
          <Card style={styles.signOff}>
            <Text style={styles.signOffText}>Job completed</Text>
            <Switch
              value={completed}
              onValueChange={setCompleted}
              trackColor={{ true: C.primary, false: '#CBD5E1' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#CBD5E1"
              accessibilityLabel="Job completed"
            />
          </Card>
        </Section>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable onPress={submit} accessibilityRole="button" style={({ pressed }) => [styles.submit, pressed && styles.pressed]}>
          <Text style={styles.submitText}>Submit report</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function LimitedText({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        multiline
        maxLength={REPORT_TEXT_LIMIT}
        accessibilityLabel={label}
        style={styles.textArea}
      />
      <Text style={styles.counter}>
        {value.length}/{REPORT_TEXT_LIMIT}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: Spacing.four - 4,
    gap: Spacing.four - 4,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three - 4,
    padding: Spacing.three,
  },
  jobTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  meta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 110,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    color: C.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    color: C.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  photos: {
    gap: Spacing.two,
    paddingTop: 6,
    paddingRight: 6,
  },
  photo: {
    width: 76,
    height: 76,
  },
  photoImage: {
    width: 76,
    height: 76,
    borderRadius: Radius.medium,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.text,
    borderWidth: 2,
    borderColor: C.card,
  },
  addPhoto: {
    width: 76,
    height: 76,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B9CCF5',
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: {
    color: C.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  signOff: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  signOffText: {
    color: C.text,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.three,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  submit: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    backgroundColor: C.primary,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  doneScreen: {
    justifyContent: 'center',
    padding: Spacing.four,
  },
  doneCard: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  doneTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
  },
  doneText: {
    color: C.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
  doneButton: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
});
