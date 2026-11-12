import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/employee/ui';
import { Button, Note } from '@/components/signup/fields';
import { SuperFields, superFormErrors } from '@/components/super-fields';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { currentEmployeeStore, useCurrentEmployee } from '@/data/current-employee';
import {
  choiceText,
  formFrom,
  loadSuperHistory,
  revealSuperNumbers,
  saveMySuper,
  saveMyTfn,
  useEmployeeSuper,
  useSuperSettings,
  type SuperForm,
  type SuperHistoryEntry,
} from '@/data/employee-super';
import { isContractor } from '@/data/employees';
import { useDesktopPageStyle } from '@/hooks/use-desktop';
import { formatBsb } from '@/lib/super-validation';
import { businessUsesSuper } from '@/data/super-rules';
import { useBusiness } from '@/data/business';

const dateText = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

// The employee's super details: where their super is paid, their TFN, and the
// declaration. Changing them keeps the old version in the history.
export default function SuperDetailsScreen() {
  const desktopPage = useDesktopPageStyle('form');
  const me = useCurrentEmployee();
  const saved = useEmployeeSuper().find((s) => s.employeeId === me?.id);
  const settings = useSuperSettings();
  const business = useBusiness();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<SuperForm | null>(null);
  const [tfn, setTfn] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [history, setHistory] = useState<SuperHistoryEntry[]>([]);
  const [revealed, setRevealed] = useState<{ bsb: string | null; accountNumber: string | null } | null>(null);

  useEffect(() => {
    if (me?.id) loadSuperHistory(me.id).then(setHistory);
  }, [me?.id, saved?.updatedAt]);

  if (!me) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (!businessUsesSuper(business)) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.muted}>Super only applies to Australian businesses, so there&apos;s nothing to fill in here.</Text>
      </View>
    );
  }

  if (isContractor(me)) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.muted}>As a contractor you look after your own super, so there&apos;s nothing to fill in here.</Text>
      </View>
    );
  }

  // Start from what's saved. The SMSF bank numbers are never sent back, so changing an SMSF means typing them again.
  const current = form ?? formFrom(saved, me.gender);
  const changingSmsfNumbers = current.choice === 'smsf';
  const errors = superFormErrors(current, tfn);

  async function save() {
    setTried(true);
    setMessage(null);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      const problem = await saveMySuper(current, me!.id);
      if (problem) {
        setMessage({ text: problem, error: true });
        return;
      }
      if (tfn) {
        const tfnProblem = await saveMyTfn(tfn);
        if (tfnProblem) {
          setMessage({ text: `Your super details are saved, but not your TFN: ${tfnProblem}`, error: true });
          return;
        }
      }
      // Show the new details straight away (the TFN only as "given").
      currentEmployeeStore.set((e) => (e ? { ...e, gender: current.gender ?? e.gender, hasTfn: tfn ? true : e.hasTfn } : e));
      setForm(null);
      setTfn('');
      setTried(false);
      setRevealed(null);
      setMessage({ text: 'Saved. Your employer has been sent your new super details.', error: false });
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    try {
      setRevealed(await revealSuperNumbers(me!.id));
    } catch {
      setMessage({ text: 'Couldn’t show the numbers. Please try again.', error: true });
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }, desktopPage]} keyboardShouldPersistTaps="handled">
        {saved && (
          <Card style={styles.summary}>
            <Text style={styles.summaryTitle}>{choiceText(saved.choice, saved.fundName)}</Text>
            <Text style={styles.muted}>Confirmed {dateText(saved.declaredAt)}</Text>
            {saved.choice === 'smsf' && (
              <View style={styles.revealRow}>
                <Text style={styles.muted}>
                  BSB {revealed?.bsb ? formatBsb(revealed.bsb) : `•••${saved.smsfBsbLast3 ?? ''}`} · Account{' '}
                  {revealed?.accountNumber ?? `•••${saved.smsfAccountLast3 ?? ''}`}
                </Text>
                <Pressable onPress={revealed ? () => setRevealed(null) : reveal} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.link}>{revealed ? 'Hide' : 'Reveal'}</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.muted}>TFN: {me.hasTfn ? 'given (stored encrypted)' : 'not given'}</Text>
          </Card>
        )}

        <Card style={styles.form}>
          <Text style={styles.heading}>{saved ? 'Change your super details' : 'Set up your super'}</Text>
          <SuperFields
            form={current}
            update={(changes) => setForm({ ...current, ...changes })}
            errors={errors}
            showErrors={tried}
            tfn={tfn}
            onTfnChange={setTfn}
            tfnHint={me.hasTfn ? 'You’ve already given your TFN. Leave this blank to keep it, or type a new one to change it.' : undefined}
            defaultFundName={settings.defaultFundName || undefined}
            savedNumbersHint={
              changingSmsfNumbers && saved?.choice === 'smsf'
                ? `Saved: BSB •••${saved.smsfBsbLast3 ?? ''}, account •••${saved.smsfAccountLast3 ?? ''}. Type them again to confirm (they're never shown in full here).`
                : undefined
            }
          />
          {message && <Text style={message.error ? styles.error : styles.success}>{message.text}</Text>}
          <Button label={busy ? 'Saving…' : 'Save super details'} onPress={save} disabled={busy} />
          <Note>Never give anyone your super fund login or password. Your employer only needs the details above.</Note>
        </Card>

        {history.length > 0 && (
          <Card style={styles.form}>
            <Text style={styles.heading}>Earlier details</Text>
            {history.map((h) => (
              <View key={h.id} style={styles.historyRow}>
                <Text style={styles.historyText}>{choiceText(h.choice, h.fundName)}</Text>
                <Text style={styles.muted}>Changed {dateText(h.replacedAt)}</Text>
              </View>
            ))}
          </Card>
        )}
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back} hitSlop={8}>
          <Text style={styles.link}>Back to my profile</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  summary: {
    gap: 4,
  },
  summaryTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  form: {
    gap: Spacing.three,
  },
  heading: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  revealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 32,
  },
  link: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: C.danger,
    fontSize: 14,
  },
  success: {
    color: C.success,
    fontSize: 14,
    fontWeight: '600',
  },
  historyRow: {
    gap: 2,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  historyText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  back: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
});
