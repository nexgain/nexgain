import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { SelectField } from '@/components/employee/form-fields';
import { Button, Field, Input, Note, SignupColors as C, YesNo } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';
import { businessUsesSuper } from '@/data/super-rules';
import { COUNTRIES, countryNeedsBank, isEurozone, NZ_BANKS } from '@/lib/payment-files/countries';
import { abnError, formatAbn, requiredError, usiError } from '@/lib/super-validation';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const START_OPTIONS = MONTHS.map((m) => `1 ${m}`);

export const CURRENCIES = [
  'AUD – Australian Dollar',
  'NZD – New Zealand Dollar',
  'USD – US Dollar',
  'GBP – British Pound',
  'EUR – Euro',
  'CAD – Canadian Dollar',
] as const;

const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

/** The usual currency for a country, so picking the country fills it in. */
function currencyFor(code: string): (typeof CURRENCIES)[number] | null {
  if (isEurozone(code)) return 'EUR – Euro';
  const prefix = ({ AU: 'AUD', NZ: 'NZD', US: 'USD', GB: 'GBP', CA: 'CAD' } as Record<string, string>)[code];
  return CURRENCIES.find((c) => c.startsWith(`${prefix} `)) ?? null;
}

/** What's still needed on this step (field -> message). */
export function financialErrors(data: StepProps['data']) {
  const e: Record<string, string | null> = { country: data.country ? null : 'Choose the country your business is in.' };
  // New Zealand: each bank has its own payroll file, so ask which one.
  if (countryNeedsBank(data.country) && !NZ_BANKS.some((b) => b.id === data.bank)) e.bank = 'Choose your bank.';
  // Australian businesses: a default super fund for staff who choose "use my employer's fund".
  if (data.country && businessUsesSuper({ country: data.country })) {
    e.superFundName = requiredError(data.superFundName, 'the fund’s name');
    e.superFundUsi = usiError(data.superFundUsi);
    e.superFundAbn = abnError(data.superFundAbn);
  }
  return Object.fromEntries(Object.entries(e).filter((x): x is [string, string] => !!x[1]));
}

export function StepFinancial({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);
  const errors = financialErrors(data);
  const err = (key: string) => (tried ? errors[key] : undefined);
  const usesSuper = !!data.country && businessUsesSuper({ country: data.country });

  return (
    <>
      <Field label="Country" error={err('country')} hint="Where your business pays its staff. This decides the bank payment file payroll makes, and whether super applies.">
        <SelectField
          title="Country"
          value={COUNTRIES.find((c) => c.code === data.country)?.name ?? null}
          options={COUNTRY_NAMES}
          placeholder="Select country"
          onChange={(name) => {
            const code = COUNTRIES.find((c) => c.name === name)?.code ?? 'OTHER';
            update({ country: code, currency: currencyFor(code) ?? data.currency });
          }}
        />
      </Field>

      {countryNeedsBank(data.country) && (
        <Field label="Your bank" error={err('bank')} hint="The bank your business pays wages from. Each bank has its own payroll file.">
          <SelectField
            title="Your bank"
            value={NZ_BANKS.find((b) => b.id === data.bank)?.name ?? null}
            options={NZ_BANKS.map((b) => b.name)}
            placeholder="Select your bank"
            onChange={(name) => update({ bank: NZ_BANKS.find((b) => b.name === name)?.id ?? '' })}
          />
        </Field>
      )}

      {usesSuper && (
        <>
          <Text style={styles.heading}>Default super fund</Text>
          <Note>
            Staff who choose &quot;use my employer&apos;s fund&quot; are paid into this fund. You can change it later in Business
            Profile. (Before using it for someone who isn&apos;t sure, check with the ATO for their existing &quot;stapled&quot;
            fund; NexGain reminds you.)
          </Note>
          <Field label="Fund name" error={err('superFundName')}>
            <Input value={data.superFundName} onChangeText={(superFundName) => update({ superFundName })} placeholder="e.g. AustralianSuper" autoCapitalize="words" maxLength={100} accessibilityLabel="Default fund name" hasError={!!err('superFundName')} />
          </Field>
          <Field label="Fund USI (Unique Superannuation Identifier)" error={err('superFundUsi')} hint="On the fund's website, usually under 'Employers'.">
            <Input value={data.superFundUsi} onChangeText={(t) => update({ superFundUsi: t.toUpperCase() })} placeholder="e.g. STA0100AU" autoCapitalize="characters" autoCorrect={false} maxLength={20} accessibilityLabel="Default fund USI" hasError={!!err('superFundUsi')} />
          </Field>
          <Field label="Fund ABN" error={err('superFundAbn')}>
            <Input value={formatAbn(data.superFundAbn)} onChangeText={(t) => update({ superFundAbn: t.replace(/\D/g, '').slice(0, 11) })} placeholder="11 digits" keyboardType="number-pad" accessibilityLabel="Default fund ABN" hasError={!!err('superFundAbn')} />
          </Field>
        </>
      )}

      <Field label="Financial year start date">
        <SelectField
          title="Financial year start date"
          value={START_OPTIONS[data.financialYearStartMonth - 1]}
          options={START_OPTIONS}
          placeholder="Select start date"
          onChange={(value) => update({ financialYearStartMonth: START_OPTIONS.indexOf(value) + 1 })}
        />
      </Field>

      <Field
        label="Are you registered for GST?"
        hint={data.gstRegistered ? 'GST (10%) will be added to your quotes and invoices.' : "GST won't be added to your quotes and invoices."}>
        <YesNo label="Registered for GST" value={data.gstRegistered} onChange={(gstRegistered) => update({ gstRegistered })} />
      </Field>

      <Field label="Default currency">
        <SelectField
          title="Default currency"
          value={data.currency as (typeof CURRENCIES)[number]}
          options={CURRENCIES}
          placeholder="Select currency"
          onChange={(currency) => update({ currency })}
        />
      </Field>

      <Field label="Do you want to track GST in reports?">
        <YesNo label="Track GST in reports" value={data.trackGstInReports} onChange={(trackGstInReports) => update({ trackGstInReports })} />
      </Field>

      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (Object.keys(errors).length === 0) onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
});
