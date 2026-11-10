import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { comingSoon } from '@/components/auth/auth-screen';
import { employeeSteps, maskLast4, type EmployeeSignupData, type EmployeeStepId } from '@/components/employee-signup/types';
import { Button, fieldStyles, SignupColors as C } from '@/components/signup/fields';
import { choiceText } from '@/data/employee-super';

export function StepReview({
  data,
  onEdit,
  onCreate,
  busy,
}: {
  data: EmployeeSignupData;
  /** Jump back to a step to change something. */
  onEdit: (step: EmployeeStepId) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const asksSuper = employeeSteps(data).some((s) => s.id === 'super');
  const rows: { label: string; value: string; step: EmployeeStepId }[] = [
    { label: 'Full name', value: data.fullName, step: 'personal' },
    { label: 'Email', value: data.email, step: 'account' },
    { label: 'Phone', value: data.phone, step: 'personal' },
    { label: 'Position', value: data.position, step: 'personal' },
    { label: 'Employment type', value: data.employmentType ?? '—', step: 'personal' },
    ...(data.employmentType === 'Contractor'
      ? [
          { label: 'ABN', value: data.abn, step: 'personal' as const },
          { label: 'Registered for GST', value: data.gstRegistered ? 'Yes' : 'No', step: 'personal' as const },
        ]
      : []),
    { label: 'Bank account', value: maskLast4(data.iban.replace(/\D/g, '').slice(-4) || data.accountNumber), step: 'bank' },
    // Australian businesses only (see businessUsesSuper).
    ...(asksSuper
      ? [
          {
            label: 'Superannuation',
            value: data.superForm.choice ? choiceText(data.superForm.choice, data.superForm.fundName.trim() || null, '') : 'Not chosen',
            step: 'super' as const,
          },
        ]
      : []),
    {
      label: 'Qualifications',
      value: data.qualifications.map((q) => q.name).join(', ') || 'None added',
      step: 'additional',
    },
    { label: 'Business', value: data.business?.name ?? '—', step: 'join' },
  ];

  return (
    <>
      <View style={fieldStyles.card}>
        {rows.map((row, i) => (
          <View key={row.label} style={[styles.row, i > 0 && styles.divider]}>
            <View style={fieldStyles.flex}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.value}>{row.value || '—'}</Text>
            </View>
            <Pressable
              onPress={() => onEdit(row.step)}
              accessibilityRole="link"
              accessibilityLabel={`Edit ${row.label}`}
              hitSlop={8}>
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.muted}>Creating your account and joining {data.business?.name}…</Text>
        </View>
      ) : (
        <Button label="Create Account" arrow onPress={onCreate} />
      )}

      <Text style={styles.terms}>
        By creating an account, you agree to our{' '}
        <Text style={styles.termsLink} onPress={() => comingSoon('Terms')} accessibilityRole="link">
          Terms
        </Text>{' '}
        and{' '}
        <Text style={styles.termsLink} onPress={() => comingSoon('Privacy Policy')} accessibilityRole="link">
          Privacy Policy
        </Text>
        .
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  label: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  edit: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 14,
  },
  terms: {
    color: C.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: C.primary,
    fontWeight: '600',
  },
});
