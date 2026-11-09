// "Where should your super be paid?": the four choices and only the fields
// each one needs, the TFN, gender and the declaration. Used in employee
// sign-up and on the employee's profile, so both ask the same way.
// Never asks for a super fund login, username or password: super is paid using
// the fund's details.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Checkbox, Field, Input, Note, SignupColors as C } from '@/components/signup/fields';
import { DECLARATION, GENDERS, OWN_FUND_HELP, SUPER_CHOICES, TFN_NOTE, type SuperForm } from '@/data/employee-super';
import {
  abnError,
  accountNumberError,
  bsbError,
  esaError,
  formatAbn,
  formatBsb,
  requiredError,
  tfnError,
  usiError,
} from '@/lib/super-validation';

/** Problems with the form (field -> message). Empty when it can be saved. */
export function superFormErrors(form: SuperForm, tfn: string | null): Record<string, string> {
  const e: Record<string, string | null> = {};
  if (!form.choice) e.choice = 'Choose where your super should be paid.';
  if (form.choice === 'own') {
    e.fundName = requiredError(form.fundName, 'the fund’s name');
    e.fundAbn = abnError(form.fundAbn);
    e.usi = usiError(form.usi);
    e.memberNumber = requiredError(form.memberNumber, 'your member account number');
  }
  if (form.choice === 'smsf') {
    e.fundName = requiredError(form.fundName, 'the fund’s name');
    e.fundAbn = abnError(form.fundAbn);
    e.esa = esaError(form.esa);
    e.smsfAccountName = requiredError(form.smsfAccountName, 'the fund’s bank account name');
    e.smsfBsb = bsbError(form.smsfBsb);
    e.smsfAccountNumber = accountNumberError(form.smsfAccountNumber);
  }
  if (tfn !== null) e.tfn = tfnError(tfn);
  if (!form.declared) e.declared = 'Please tick the box to confirm your super details.';
  return Object.fromEntries(Object.entries(e).filter((x): x is [string, string] => !!x[1]));
}

function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>
            <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
            <View style={styles.flex}>
              <Text style={styles.choiceLabel}>{o.label}</Text>
              {o.hint ? <Text style={styles.choiceHint}>{o.hint}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SuperFields({
  form,
  update,
  errors,
  showErrors,
  tfn,
  onTfnChange,
  tfnHint,
  defaultFundName,
  savedNumbersHint,
}: {
  form: SuperForm;
  update: (changes: Partial<SuperForm>) => void;
  errors: Record<string, string>;
  showErrors: boolean;
  /** null: don't ask for the TFN here (asked elsewhere). */
  tfn: string | null;
  onTfnChange?: (tfn: string) => void;
  /** e.g. "You've given your TFN (•••••789). Type a new one to change it." */
  tfnHint?: string;
  /** The employer's default fund, when they've set one. */
  defaultFundName?: string;
  /** Shown under the SMSF bank fields when numbers are already saved (they're never shown back in full). */
  savedNumbersHint?: string;
}) {
  const err = (key: string) => (showErrors ? errors[key] : undefined);
  const set = (key: keyof SuperForm) => (value: string) => update({ [key]: value } as Partial<SuperForm>);

  return (
    <View style={styles.wrap}>
      <Field label="Gender" optional hint="Super funds ask for this when setting up your account.">
        <Choice label="Gender" options={GENDERS} value={form.gender} onChange={(gender) => update({ gender })} />
      </Field>

      <Field label="Where should your super be paid?" error={err('choice')}>
        <Choice
          label="Where should your super be paid"
          options={SUPER_CHOICES.map((c) =>
            c.id === 'default' && defaultFundName ? { ...c, hint: `Your employer's fund: ${defaultFundName}.` } : c,
          )}
          value={form.choice}
          onChange={(choice) => update({ choice })}
        />
      </Field>

      {form.choice === 'default' && <Note>That&apos;s all. Your employer will set up your super with their fund.</Note>}

      {form.choice === 'unsure' && (
        <Note>
          No problem. Your employer will ask the ATO for the super fund you already have (your &quot;stapled&quot; fund),
          so it keeps being paid into the same place.
        </Note>
      )}

      {form.choice === 'own' && (
        <>
          <Note>{OWN_FUND_HELP}</Note>
          <Field label="Fund name" error={err('fundName')}>
            <Input value={form.fundName} onChangeText={set('fundName')} placeholder="e.g. AustralianSuper" autoCapitalize="words" maxLength={100} accessibilityLabel="Fund name" hasError={!!err('fundName')} />
          </Field>
          <Field label="Fund ABN" error={err('fundAbn')}>
            <Input value={form.fundAbn} onChangeText={(t) => update({ fundAbn: formatAbn(t) })} placeholder="11 digits" keyboardType="number-pad" accessibilityLabel="Fund ABN" hasError={!!err('fundAbn')} />
          </Field>
          <Field label="USI (Unique Superannuation Identifier)" error={err('usi')}>
            <Input value={form.usi} onChangeText={(t) => update({ usi: t.toUpperCase() })} placeholder="e.g. STA0100AU" autoCapitalize="characters" autoCorrect={false} maxLength={20} accessibilityLabel="USI" hasError={!!err('usi')} />
          </Field>
          <Field label="Member account number" error={err('memberNumber')}>
            <Input value={form.memberNumber} onChangeText={set('memberNumber')} placeholder="Your member number with the fund" autoCapitalize="characters" autoCorrect={false} maxLength={30} accessibilityLabel="Member account number" hasError={!!err('memberNumber')} />
          </Field>
          <Field label="Account name" optional hint="Usually your own name.">
            <Input value={form.accountName} onChangeText={set('accountName')} placeholder="Your name as the fund has it" autoCapitalize="words" maxLength={100} accessibilityLabel="Account name" />
          </Field>
        </>
      )}

      {form.choice === 'smsf' && (
        <>
          <Field label="Fund name" error={err('fundName')}>
            <Input value={form.fundName} onChangeText={set('fundName')} placeholder="Your SMSF's name" autoCapitalize="words" maxLength={100} accessibilityLabel="Fund name" hasError={!!err('fundName')} />
          </Field>
          <Field label="Fund ABN" error={err('fundAbn')}>
            <Input value={form.fundAbn} onChangeText={(t) => update({ fundAbn: formatAbn(t) })} placeholder="11 digits" keyboardType="number-pad" accessibilityLabel="Fund ABN" hasError={!!err('fundAbn')} />
          </Field>
          <Field label="Electronic Service Address (ESA)" error={err('esa')} hint="Your SMSF's administrator or accountant can tell you this.">
            <Input value={form.esa} onChangeText={set('esa')} placeholder="e.g. esuper" autoCapitalize="none" autoCorrect={false} maxLength={40} accessibilityLabel="Electronic Service Address" hasError={!!err('esa')} />
          </Field>
          <Field label="Fund bank account name" error={err('smsfAccountName')}>
            <Input value={form.smsfAccountName} onChangeText={set('smsfAccountName')} placeholder="The SMSF's bank account name" autoCapitalize="words" maxLength={100} accessibilityLabel="Fund bank account name" hasError={!!err('smsfAccountName')} />
          </Field>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label="BSB" error={err('smsfBsb')}>
                <Input value={form.smsfBsb} onChangeText={(t) => update({ smsfBsb: formatBsb(t) })} placeholder="123-456" keyboardType="number-pad" accessibilityLabel="BSB" hasError={!!err('smsfBsb')} />
              </Field>
            </View>
            <View style={styles.flex}>
              <Field label="Account number" error={err('smsfAccountNumber')}>
                <Input value={form.smsfAccountNumber} onChangeText={(t) => update({ smsfAccountNumber: t.replace(/\D/g, '').slice(0, 10) })} placeholder="5 to 10 digits" keyboardType="number-pad" password accessibilityLabel="Account number" hasError={!!err('smsfAccountNumber')} />
              </Field>
            </View>
          </View>
          {savedNumbersHint ? <Note>{savedNumbersHint}</Note> : null}
        </>
      )}

      {tfn !== null && onTfnChange && (
        <Field label="Tax file number (TFN)" optional error={err('tfn')} hint={tfnHint}>
          <Input value={tfn} onChangeText={(t) => onTfnChange(t.replace(/\D/g, '').slice(0, 9))} placeholder="9 digits" keyboardType="number-pad" autoComplete="off" password accessibilityLabel="Tax file number" hasError={!!err('tfn')} />
          <Note>{TFN_NOTE}</Note>
        </Field>
      )}

      <Pressable
        onPress={() => update({ declared: !form.declared })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: form.declared }}
        style={({ pressed }) => [styles.declare, pressed && styles.pressed]}>
        <Checkbox checked={form.declared} />
        <Text style={styles.declareText}>{DECLARATION}</Text>
      </Pressable>
      {err('declared') ? <Text style={styles.error}>{err('declared')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  pressed: {
    opacity: 0.8,
  },
  choices: {
    gap: 8,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  choiceSelected: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: C.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.primary,
  },
  choiceLabel: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  choiceHint: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  declare: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    minHeight: 44,
    paddingVertical: 4,
  },
  declareText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
});
