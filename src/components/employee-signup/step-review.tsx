import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { comingSoon } from '@/components/auth/auth-screen';
import { maskLast4, type EmployeeSignupData } from '@/components/employee-signup/types';
import { Button, fieldStyles, SignupColors as C } from '@/components/signup/fields';

export function StepReview({
  data,
  onEdit,
  onCreate,
  busy,
}: {
  data: EmployeeSignupData;
  /** Jump back to a step (0-based) to change something. */
  onEdit: (step: number) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const superFund = data.superFund === 'Other' ? data.superFundOther : data.superFund;
  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Full name', value: data.fullName, step: 2 },
    { label: 'Email', value: data.email, step: 0 },
    { label: 'Phone', value: data.phone, step: 2 },
    { label: 'Position', value: data.position, step: 2 },
    { label: 'Employment type', value: data.employmentType ?? '—', step: 2 },
    ...(data.employmentType === 'Contractor'
      ? [
          { label: 'ABN', value: data.abn, step: 2 },
          { label: 'Registered for GST', value: data.gstRegistered ? 'Yes' : 'No', step: 2 },
        ]
      : []),
    { label: 'Bank account', value: maskLast4(data.accountNumber), step: 3 },
    { label: 'Superannuation', value: superFund || 'Not provided', step: 4 },
    {
      label: 'Qualifications',
      value: data.qualifications.map((q) => q.name).join(', ') || 'None added',
      step: 4,
    },
    { label: 'Business', value: data.business?.name ?? '—', step: 1 },
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
