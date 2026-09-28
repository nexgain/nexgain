import { useState } from 'react';

import { SelectField } from '@/components/employee/form-fields';
import { Button, Field, Input, Note } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';
import { BUSINESS_TYPES } from '@/data/industries';

const TEAM_SIZES = ['1–5', '6–10', '11–20', '21–50', '50+'] as const;
const VEHICLES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'] as const;
const YEARS = ['Less than 1 year', '1–3 years', '3–5 years', '5–10 years', '10+ years'] as const;

export function StepType({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);
  const yearsError = !data.yearsOperating && 'Choose how long you have been operating.';

  return (
    <>
      <Field label="Business industry">
        <Input value={data.industry?.name ?? ''} editable={false} accessibilityLabel="Business industry" />
      </Field>

      <Field label="Business type">
        <SelectField
          title="Business type"
          value={data.businessType as (typeof BUSINESS_TYPES)[number]}
          options={BUSINESS_TYPES}
          placeholder="Select business type"
          onChange={(businessType) => update({ businessType })}
        />
      </Field>

      <Field label="Number of team members">
        <SelectField
          title="Number of team members"
          value={data.teamSize as (typeof TEAM_SIZES)[number]}
          options={TEAM_SIZES}
          placeholder="Select team size"
          onChange={(teamSize) => update({ teamSize })}
        />
      </Field>

      <Field label="Number of service vehicles">
        <SelectField
          title="Number of service vehicles"
          value={data.vehicles as (typeof VEHICLES)[number]}
          options={VEHICLES}
          placeholder="Select number of vehicles"
          onChange={(vehicles) => update({ vehicles })}
        />
      </Field>

      <Field label="How long have you been operating?" error={tried && yearsError}>
        <SelectField
          title="How long have you been operating?"
          value={data.yearsOperating as (typeof YEARS)[number] | null}
          options={YEARS}
          placeholder="Select an option"
          onChange={(yearsOperating) => update({ yearsOperating })}
          hasError={tried && !!yearsError}
        />
      </Field>

      <Note>We&apos;ve pre-filled some details based on your industry selection. You can adjust these at any time.</Note>

      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (!yearsError) onNext();
        }}
      />
    </>
  );
}
