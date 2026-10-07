// Pieces shared by the owner's Employees list, Add Employee and Employee
// Profile screens, plus the invite code card on the Dashboard.
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { EMPLOYMENT_TYPES } from '@/components/employee-signup/types';
import { FieldButton, FormField, OptionSheet, OWNER_PICKER_THEME, TextField } from '@/components/owner/form';
import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { Badge, Button, Card, Icon, OwnerIcons } from '@/components/owner/ui';
import { useNativePicker } from '@/components/pickers/use-native-picker';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { regenerateInviteCode, useBusiness } from '@/data/business';
import { formatShortDate } from '@/data/employee-roster';
import { inviteByEmail, inviteBySms, shareInvite, type EmployeeInvite } from '@/data/employee-invites';
import {
  AUTO_OVERTIME_MULTIPLIER,
  autoOvertimeRate,
  EMPLOYEE_STATUS_LABEL,
  employeeInitialsOf,
  type EmployeeStatus,
  type PayType,
} from '@/data/employees';
import { fromDateKey, toDateKey } from '@/data/shifts';

export type ListStatus = EmployeeStatus | 'invited';

const STATUS_TONE = {
  active: 'success',
  on_leave: 'warning',
  inactive: 'danger',
  invited: 'info',
} as const;

export function StatusBadge({ status }: { status: ListStatus }) {
  return <Badge label={status === 'invited' ? 'Invited' : EMPLOYEE_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}

/** Profile photo, or their initials when there isn't one. */
export function Avatar({ name, photoUrl, size = 44 }: { name: string; photoUrl?: string | null; size?: number }) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={[styles.avatar, round]} contentFit="cover" accessibilityLabel={`${name}'s photo`} />;
  }
  return (
    <View style={[styles.avatar, round]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{employeeInitialsOf(name)}</Text>
    </View>
  );
}

/** A dropdown: shows the chosen value, opens a bottom sheet of options. */
export function SelectBox<T extends string>({
  label,
  value,
  options,
  onChange,
  display,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  onChange: (value: T) => void;
  display?: (value: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const labels = options.map((o) => (display ? display(o) : o));
  const shown = value ? (display ? display(value) : value) : null;
  return (
    <>
      <FieldButton value={shown} placeholder="Select" icon={OwnerIcons.chevronDown} onPress={() => setOpen(true)} accessibilityLabel={label} />
      <OptionSheet
        visible={open}
        title={label}
        options={labels}
        value={shown}
        onSelect={(picked) => onChange(options[labels.indexOf(picked)])}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** Date field that can be left empty. Value is "YYYY-MM-DD" or null. */
export function OptionalDateField({
  label,
  value,
  onChange,
  placeholder = 'Select date',
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}) {
  const picker = useNativePicker({
    mode: 'date',
    value: value ? fromDateKey(value) : new Date(),
    onChange: (d) => onChange(toDateKey(d)),
    title: label,
    theme: OWNER_PICKER_THEME,
  });
  return (
    <View style={styles.dateRow}>
      <View style={styles.flex}>
        <FieldButton
          value={value ? formatShortDate(fromDateKey(value)) : null}
          placeholder={placeholder}
          icon={OwnerIcons.calendar}
          onPress={picker.open}
          accessibilityLabel={label}
        />
      </View>
      {value ? (
        <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={8}>
          <Icon name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} color={C.textSecondary} size={20} />
        </Pressable>
      ) : null}
      {picker.element}
    </View>
  );
}

export const PAY_TYPES: readonly PayType[] = ['hourly', 'salary'];
const PAY_TYPE_SHORT: Record<PayType, string> = { hourly: 'per hour', salary: 'per year' };

export type EmploymentDraft = {
  role: string;
  payRate: string;
  payType: PayType;
  employmentType: string;
  startDate: string | null;
  /** Custom overtime rate text; '' = Auto (1.5x). Leave out to hide the overtime field. */
  overtimeRate?: string;
};

/** Checks the overtime rate text. '' means Auto. Returns the custom rate (or null for Auto), or an error. */
export function parseOvertimeRate(text: string): { rate: number | null } | { error: string } {
  if (!text.trim()) return { rate: null };
  const rate = Number(text.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(rate) || rate <= 0 || rate > 2000) return { error: 'Enter an hourly overtime rate, e.g. 42.00' };
  return { rate: Math.round(rate * 100) / 100 };
}

/** Checks the pay rate text. Returns the rate (or null if blank), or an error message. */
export function parsePayRate(text: string, payType: PayType): { rate: number | null } | { error: string } {
  if (!text.trim()) return { rate: null };
  const rate = Number(text.replace(/[$,\s]/g, ''));
  if (payType === 'salary') {
    if (!Number.isFinite(rate) || rate < 1000 || rate > 10_000_000) return { error: 'Enter a yearly salary, e.g. 75000' };
  } else if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) {
    return { error: 'Enter an hourly rate, e.g. 32.50' };
  }
  return { rate: Math.round(rate * 100) / 100 };
}

/** Role, pay rate + pay type, employment type and start date. */
export function EmploymentFields({
  draft,
  onChange,
  roleSuggestions,
}: {
  draft: EmploymentDraft;
  onChange: (changes: Partial<EmploymentDraft>) => void;
  roleSuggestions: string[];
}) {
  const parsed = parsePayRate(draft.payRate, draft.payType);
  return (
    <>
      <FormField label="Role">
        <TextField
          value={draft.role}
          onChangeText={(role) => onChange({ role })}
          placeholder="e.g. Technician"
          autoCapitalize="words"
          accessibilityLabel="Role"
        />
        {roleSuggestions.length > 0 && (
          <View style={styles.chips}>
            {roleSuggestions.slice(0, 6).map((role) => {
              const selected = draft.role.trim().toLowerCase() === role.toLowerCase();
              return (
                <Pressable
                  key={role}
                  onPress={() => onChange({ role })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.chip, selected && styles.chipSelected]}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{role}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </FormField>

      <FormField label="Pay rate" error={'error' in parsed ? parsed.error : undefined}>
        <View style={styles.payRow}>
          <View style={styles.dollar}>
            <Text style={styles.dollarText}>$</Text>
          </View>
          <TextField
            value={draft.payRate}
            onChangeText={(payRate) => onChange({ payRate })}
            placeholder={draft.payType === 'salary' ? '75000' : '28.00'}
            keyboardType="decimal-pad"
            accessibilityLabel="Pay rate"
            style={styles.flex}
          />
          <View style={styles.payType}>
            <SelectBox
              label="Pay type"
              value={draft.payType}
              options={PAY_TYPES}
              display={(t) => PAY_TYPE_SHORT[t]}
              onChange={(payType) => onChange({ payType })}
            />
          </View>
        </View>
      </FormField>

      {draft.overtimeRate !== undefined && draft.payType === 'hourly' && (
        <OvertimeRateField
          value={draft.overtimeRate}
          payRate={'rate' in parsed ? parsed.rate : null}
          onChange={(overtimeRate) => onChange({ overtimeRate })}
        />
      )}

      <FormField label="Employment type">
        <SelectBox
          label="Employment type"
          value={(draft.employmentType || null) as (typeof EMPLOYMENT_TYPES)[number] | null}
          options={EMPLOYMENT_TYPES}
          onChange={(employmentType) => onChange({ employmentType })}
        />
      </FormField>

      <FormField label="Start date">
        <OptionalDateField label="Start date" value={draft.startDate} onChange={(startDate) => onChange({ startDate })} />
      </FormField>
    </>
  );
}

/**
 * Overtime rate per hour. Shows the automatic 1.5x rate (following the pay rate)
 * until the owner types their own amount, which makes it Custom.
 */
function OvertimeRateField({
  value,
  payRate,
  onChange,
}: {
  value: string;
  payRate: number | null;
  onChange: (value: string) => void;
}) {
  const custom = value.trim() !== '';
  const auto = autoOvertimeRate(payRate);
  const parsed = parseOvertimeRate(value);
  return (
    <FormField label="Overtime rate (per hour)" error={'error' in parsed ? parsed.error : undefined}>
      <View style={styles.payRow}>
        <View style={styles.dollar}>
          <Text style={styles.dollarText}>$</Text>
        </View>
        <TextField
          // Auto shows the 1.5x amount; typing replaces it with a custom rate.
          value={custom ? value : auto === null ? '' : auto.toFixed(2)}
          onChangeText={onChange}
          placeholder={auto === null ? 'Set a pay rate first' : auto.toFixed(2)}
          keyboardType="decimal-pad"
          accessibilityLabel="Overtime rate"
          style={styles.flex}
        />
        <View style={[styles.otTag, custom && styles.otTagCustom]}>
          <Text style={[styles.otTagText, custom && styles.otTagTextCustom]}>
            {custom ? 'Custom' : `Auto (${AUTO_OVERTIME_MULTIPLIER}×)`}
          </Text>
        </View>
      </View>
      {custom && (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.otReset}>
            Reset to auto{auto === null ? '' : ` (${AUTO_OVERTIME_MULTIPLIER}× = $${auto.toFixed(2)})`}
          </Text>
        </Pressable>
      )}
    </FormField>
  );
}

/** Asks how to send someone their invite: email, text message, or the share sheet. */
export function sendInvite(invite: EmployeeInvite) {
  const failed = () => Alert.alert('Couldn’t open that app', 'Try “Share” instead to send the invite another way.');
  if (Platform.OS === 'web') {
    shareInvite(invite).catch(() => {});
    return;
  }
  Alert.alert(`Invite ${invite.fullName}`, 'They’ll get the business code and a link to sign up.', [
    ...(invite.email ? [{ text: `Email ${invite.email}`, onPress: () => inviteByEmail(invite).catch(failed) }] : []),
    ...(invite.phone ? [{ text: `Text ${invite.phone}`, onPress: () => inviteBySms(invite).catch(failed) }] : []),
    { text: 'Share…', onPress: () => shareInvite(invite).catch(() => {}) },
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

/** The business invite code (top of the More screen) with Copy / Share, and "Generate new code". */
export function InviteCodeCard() {
  const business = useBusiness();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = business?.inviteCode ?? '';

  async function copy() {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage('Couldn’t copy. Press and hold the code to copy it.');
    }
  }

  function share() {
    Share.share({ message: `Join me on NexGain! Use invite code: ${code}` }).catch(() => {});
  }

  async function regenerate() {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    try {
      await regenerateInviteCode();
      setMessage('New code created. The old code no longer works.');
    } catch {
      setMessage('Couldn’t create a new code. Check your internet connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!code) return null;

  return (
    <Card
      title="Employee Invite Code"
      icon={OwnerIcons.people}
      right={
        <Pressable
          onPress={() => setConfirming(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Generate new invite code"
          hitSlop={8}
          style={({ pressed }) => [styles.regenerate, (pressed || busy) && styles.pressed]}>
          <Icon name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} color={C.textSecondary} size={12} />
          <Text style={styles.regenerateText}>{busy ? 'Creating…' : 'New code'}</Text>
        </Pressable>
      }>
      <View style={styles.codeRow}>
        <Text style={styles.code} selectable numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`Invite code ${code.split('').join(' ')}`}>
          {code}
        </Text>
      </View>
      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button
            label={copied ? 'Copied!' : 'Copy'}
            icon={
              copied
                ? { ios: 'checkmark', android: 'check', web: 'check' }
                : { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }
            }
            variant="secondary"
            onPress={copy}
          />
        </View>
        <View style={styles.flex}>
          <Button label="Share" icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} onPress={share} />
        </View>
      </View>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
      <ConfirmDialog
        visible={confirming}
        message={`Create a new invite code? ${code} will stop working straight away, so anyone who hasn't signed up yet will need the new code.`}
        confirmLabel="New Code"
        onConfirm={regenerate}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceRaised,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  avatarText: {
    color: C.text,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.three - 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipSelected: {
    borderColor: C.accent,
    backgroundColor: 'rgba(79, 140, 255, 0.14)',
  },
  chipText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: C.accent,
  },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dollar: {
    width: 36,
    height: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceRaised,
    borderWidth: 1,
    borderColor: C.border,
  },
  dollarText: {
    color: C.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  payType: {
    width: 130,
  },
  otTag: {
    width: 130,
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium - 2,
    backgroundColor: 'rgba(79, 140, 255, 0.14)',
  },
  otTagCustom: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  otTagText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  otTagTextCustom: {
    color: C.warning,
  },
  otReset: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: Spacing.one,
  },
  codeRow: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: C.surfaceRaised,
  },
  code: {
    color: C.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  regenerate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  regenerateText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
