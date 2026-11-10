import { useEffect, useState } from 'react';

import type { EmployeeStepProps } from '@/components/employee-signup/types';
import { Button } from '@/components/signup/fields';
import { SuperFields, superFormErrors } from '@/components/super-fields';
import { supabase } from '@/lib/supabase';

/**
 * "Your super fund" (Australian businesses only): use the employer's fund, use
 * their own fund, or "I'm not sure" (the employer then checks with the ATO for
 * a stapled fund; they're never put in the employer's fund automatically).
 * Plus the optional TFN and the declaration.
 */
export function StepSuper({ data, update, onNext, nextLabel }: EmployeeStepProps) {
  const [tried, setTried] = useState(false);
  const [defaultFund, setDefaultFund] = useState<string | null>(null);
  const errors = superFormErrors(data.superForm, data.tfn);

  // The employer's fund name, so they know what "Use my employer's fund" means.
  useEffect(() => {
    if (!data.businessCode) return;
    let cancelled = false;
    supabase.rpc('default_super_fund_for_code', { p_code: data.businessCode }).then(({ data: name }) => {
      if (!cancelled && typeof name === 'string' && name) setDefaultFund(name);
    });
    return () => {
      cancelled = true;
    };
  }, [data.businessCode]);

  return (
    <>
      <SuperFields
        form={data.superForm}
        update={(changes) => update({ superForm: { ...data.superForm, ...changes } })}
        errors={errors}
        showErrors={tried}
        tfn={data.tfn}
        onTfnChange={(tfn) => update({ tfn })}
        tfnHint="Stored encrypted and shown masked. Only you and your employer can see it, and it's only used for tax and super."
        defaultFundName={defaultFund ?? undefined}
      />
      <Button
        label={nextLabel}
        arrow
        onPress={() => {
          setTried(true);
          if (Object.keys(errors).length === 0) onNext();
        }}
      />
    </>
  );
}
