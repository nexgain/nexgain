import { SelectField } from '@/components/employee/form-fields';
import { Button, Field, YesNo } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';

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

export function StepFinancial({ data, update, onNext }: StepProps) {
  return (
    <>
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

      <Button label="Next" arrow onPress={onNext} />
    </>
  );
}
