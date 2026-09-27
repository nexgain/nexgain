import { useRef, type ReactNode } from 'react';

import type { NativePickerOptions } from '@/components/pickers/use-native-picker';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toInputValue(mode: 'date' | 'time', d: Date) {
  return mode === 'date'
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HIDDEN = { position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' } as const;

/** Web version: opens the browser's built-in date or time picker. */
export function useNativePicker({
  mode,
  value,
  onChange,
  title,
  minimumDate,
  maximumDate,
}: NativePickerOptions): { open: () => void; element: ReactNode } {
  const inputRef = useRef<HTMLInputElement>(null);

  const element = (
    <input
      ref={inputRef}
      type={mode}
      aria-label={title}
      value={toInputValue(mode, value)}
      min={minimumDate && mode === 'date' ? toInputValue('date', minimumDate) : undefined}
      max={maximumDate && mode === 'date' ? toInputValue('date', maximumDate) : undefined}
      step={mode === 'time' ? 300 : undefined}
      onChange={(e) => {
        const raw = e.target.value;
        if (!raw) return;
        const next = new Date(value);
        if (mode === 'date') {
          const [y, m, d] = raw.split('-').map(Number);
          next.setFullYear(y, m - 1, d);
        } else {
          const [h, min] = raw.split(':').map(Number);
          next.setHours(h, min, 0, 0);
        }
        onChange(next);
      }}
      style={HIDDEN}
    />
  );

  return { open: () => inputRef.current?.showPicker(), element };
}
