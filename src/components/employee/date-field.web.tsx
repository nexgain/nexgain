import { createElement, useRef } from 'react';

import type { DateFieldProps } from '@/components/employee/date-field';
import { FieldButton } from '@/components/employee/form-fields';
import { Icons } from '@/components/employee/ui';
import { dateKey, formatShortDate } from '@/data/employee-roster';

/** Web date field: opens the browser's built-in date picker. */
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select date',
  minimumDate,
  maximumDate,
  clearable,
  hasError,
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <FieldButton
        value={value ? formatShortDate(value) : null}
        placeholder={placeholder}
        icon={Icons.calendar}
        onPress={() => inputRef.current?.showPicker()}
        onClear={clearable ? () => onChange(null) : undefined}
        hasError={hasError}
        accessibilityLabel={label}
      />
      {createElement('input', {
        ref: inputRef,
        type: 'date',
        'aria-label': label,
        value: value ? dateKey(value) : '',
        min: minimumDate ? dateKey(minimumDate) : undefined,
        max: maximumDate ? dateKey(maximumDate) : undefined,
        onChange: (e: { target: { value: string } }) => {
          const [y, m, d] = e.target.value.split('-').map(Number);
          onChange(e.target.value ? new Date(y, m - 1, d) : null);
        },
        style: { position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' },
      })}
    </>
  );
}
