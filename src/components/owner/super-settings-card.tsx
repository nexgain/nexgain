// "Super settings" on the owner's Business Profile: who to contact about super,
// the business's default fund, the employer number with it, and the payment
// provider (clearing house). The super rate and pay frequency already live in
// Payroll Settings, so they're shown here with a link instead of being stored twice.
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { FormField, TextField } from '@/components/owner/form';
import { ActionRow, Card, OwnerIcons } from '@/components/owner/ui';
import { Colors as C } from '@/constants/theme';
import { superRateOf, updateBusiness, useBusiness } from '@/data/business';
import { updateSuperSettings, useSuperSettings, type SuperSettings } from '@/data/employee-super';
import { daysText, frequencyLabel, paySchedule } from '@/data/pay-schedule';
import { abnError, formatAbn, usiError } from '@/lib/super-validation';
import { businessUsesSuper } from '@/data/super-rules';

const percent = (rate: number) => `${Math.round(rate * 10000) / 100}%`;

export function SuperSettingsCard() {
  const business = useBusiness();
  const s = useSuperSettings();
  // Australian businesses only.
  if (!business || !businessUsesSuper(business)) return null;
  const schedule = paySchedule(business);

  const text = (key: keyof SuperSettings, label: string, props: Partial<React.ComponentProps<typeof TextField>> = {}, error?: string | null) => (
    <FormField label={label} error={error ?? undefined}>
      <TextField value={s[key]} onChangeText={(v) => updateSuperSettings({ [key]: v })} accessibilityLabel={label} {...props} />
    </FormField>
  );

  return (
    <Card title="Super settings" icon={OwnerIcons.wallet}>
      <Text style={styles.muted}>
        Details your super payment provider and funds need. NexGain only stores these for now; nothing is sent until you connect a
        super payment provider.
      </Text>

      {text('legalName', 'Business legal name', { placeholder: business.businessName || 'e.g. Smith Plumbing Pty Ltd', autoCapitalize: 'words' })}
      <FormField label="ABN" error={business.abn ? (abnError(business.abn, 'Your ABN') ?? undefined) : undefined}>
        <TextField
          value={formatAbn(business.abn)}
          onChangeText={(v) => updateBusiness({ abn: v.replace(/\D/g, '').slice(0, 11) })}
          placeholder="11 digits"
          keyboardType="number-pad"
          accessibilityLabel="ABN"
        />
      </FormField>

      <Text style={styles.section}>Super contact person</Text>
      {text('contactName', 'Name', { placeholder: business.ownerName || 'Who funds can contact', autoCapitalize: 'words' })}
      {text('contactEmail', 'Email', { placeholder: business.email || 'name@business.com', keyboardType: 'email-address', autoCapitalize: 'none' })}
      {text('contactPhone', 'Phone', { placeholder: business.phone || '04xx xxx xxx', keyboardType: 'phone-pad' })}

      <Text style={styles.section}>Default super fund</Text>
      <Text style={styles.muted}>Used for employees who choose &quot;my employer&apos;s default fund&quot;.</Text>
      {text('defaultFundName', 'Fund name', { placeholder: 'e.g. AustralianSuper', autoCapitalize: 'words' })}
      <FormField label="Fund ABN" error={s.defaultFundAbn ? (abnError(s.defaultFundAbn) ?? undefined) : undefined}>
        <TextField
          value={formatAbn(s.defaultFundAbn)}
          onChangeText={(v) => updateSuperSettings({ defaultFundAbn: v.replace(/\D/g, '').slice(0, 11) })}
          placeholder="11 digits"
          keyboardType="number-pad"
          accessibilityLabel="Default fund ABN"
        />
      </FormField>
      {text(
        'defaultFundUsi',
        'Fund USI',
        { placeholder: 'e.g. STA0100AU', autoCapitalize: 'characters', autoCorrect: false },
        s.defaultFundUsi ? usiError(s.defaultFundUsi) : null,
      )}
      {text('employerNumber', 'Employer number with this fund (optional)', { placeholder: 'If the fund gave you one', autoCapitalize: 'characters' })}

      <Text style={styles.section}>Super payment provider</Text>
      {text('providerName', 'Provider or clearing house', { placeholder: 'e.g. ATO Small Business Superannuation Clearing House', autoCapitalize: 'words' })}
      {text('providerNotes', 'Notes', { placeholder: 'Anything to remember, e.g. login is with the accountant', multiline: true })}

      <ActionRow
        icon={OwnerIcons.percent}
        label={`Super rate ${percent(superRateOf(business))} · Pay ${frequencyLabel(schedule.frequency).toLowerCase()}, ${daysText(schedule.startDay)}`}
        onPress={() => router.navigate('/payroll')}
        showDivider
      />
      <Text style={styles.muted}>Change the super rate and pay frequency in Payroll → Payroll Settings.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
});
