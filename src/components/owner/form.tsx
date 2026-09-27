import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, OwnerIcons, type IconName } from '@/components/owner/ui';
import { useNativePicker, type PickerTheme } from '@/components/pickers/use-native-picker';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { format12h, formatShortDate, formatWeekday } from '@/data/employee-roster';
import { dateToTime, timeToDate } from '@/data/time';

export const OWNER_PICKER_THEME: PickerTheme = {
  sheet: C.surface,
  border: C.border,
  text: C.text,
  muted: C.textSecondary,
  accent: C.accent,
  dark: true,
};

export function FormField({
  label,
  error,
  children,
  style,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function FieldButton({
  value,
  placeholder,
  icon,
  onPress,
  accessibilityLabel,
  hasError,
}: {
  value: string | null;
  placeholder?: string;
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  hasError?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.box, hasError && styles.boxError, pressed && styles.pressed]}>
      <Text style={[styles.boxText, !value && styles.placeholder]} numberOfLines={1}>
        {value ?? placeholder}
      </Text>
      <Icon name={icon} color={C.textSecondary} size={16} />
    </Pressable>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const picker = useNativePicker({ mode: 'date', value, onChange, title: label, theme: OWNER_PICKER_THEME });
  return (
    <>
      <FieldButton
        value={`${formatWeekday(value)} ${formatShortDate(value)}`}
        icon={OwnerIcons.calendar}
        onPress={picker.open}
        accessibilityLabel={label}
      />
      {picker.element}
    </>
  );
}

export function TimeField({
  label,
  value,
  onChange,
  hasError,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
  hasError?: boolean;
}) {
  const picker = useNativePicker({
    mode: 'time',
    value: timeToDate(value),
    onChange: (d) => onChange(dateToTime(d)),
    title: label,
    theme: OWNER_PICKER_THEME,
  });
  return (
    <>
      <FieldButton
        value={format12h(value)}
        icon={OwnerIcons.clock}
        onPress={picker.open}
        accessibilityLabel={label}
        hasError={hasError}
      />
      {picker.element}
    </>
  );
}

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={C.textSecondary}
      {...props}
      style={[styles.box, styles.input, props.multiline && styles.multiline, props.style]}
    />
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color="#FFFFFF" size={12} />}
    </View>
  );
}

/** Bottom sheet listing options; used for dropdowns. */
export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly T[];
  value: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <ScrollView>
          {options.map((option, i) => (
            <Pressable
              key={option}
              onPress={() => {
                onSelect(option);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: option === value }}
              style={({ pressed }) => [styles.option, i > 0 && styles.divider, pressed && styles.pressed]}>
              <Text style={[styles.optionText, option === value && styles.optionSelected]}>{option}</Text>
              {option === value && (
                <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color={C.accent} size={16} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export const formStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    maxHeight: '80%',
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four - 4,
  },
  sheetTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
});

const styles = StyleSheet.create({
  ...formStyles,
  field: {
    gap: Spacing.two,
  },
  label: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
  },
  boxError: {
    borderColor: C.danger,
  },
  boxText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
  },
  placeholder: {
    color: C.textSecondary,
  },
  input: {
    color: C.text,
    fontSize: 15,
  },
  multiline: {
    minHeight: 88,
    paddingTop: Spacing.three - 4,
    textAlignVertical: 'top',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three - 2,
  },
  optionText: {
    color: C.text,
    fontSize: 16,
  },
  optionSelected: {
    color: C.accent,
    fontWeight: '600',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
});
