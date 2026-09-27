import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';

export function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Tappable input-style box showing a value or placeholder, with a trailing icon. */
export function FieldButton({
  value,
  placeholder,
  icon,
  onPress,
  onClear,
  hasError,
  accessibilityLabel,
}: {
  value: string | null;
  placeholder: string;
  icon: IconName;
  onPress: () => void;
  onClear?: () => void;
  hasError?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.fieldBox,
        hasError && styles.fieldBoxError,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>
        {value ?? placeholder}
      </Text>
      {value && onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityLabel="Clear">
          <Icon name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} color={C.textMuted} size={18} />
        </Pressable>
      ) : (
        <Icon name={icon} color={C.textSecondary} size={18} />
      )}
    </Pressable>
  );
}

/** Dropdown: a field that opens a bottom sheet list of options. */
export function SelectField<T extends string>({
  title,
  value,
  options,
  placeholder,
  onChange,
  hasError,
}: {
  title: string;
  value: T | null;
  options: readonly T[];
  placeholder: string;
  onChange: (value: T) => void;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <FieldButton
        value={value}
        placeholder={placeholder}
        icon={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
        onPress={() => setOpen(true)}
        hasError={hasError}
        accessibilityLabel={title}
      />
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close">
              <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.textSecondary} size={18} />
            </Pressable>
          </View>
          <ScrollView>
            {options.map((option, i) => {
              const selected = option === value;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.option,
                    i > 0 && styles.optionDivider,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option}
                  </Text>
                  {selected && (
                    <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color={C.primary} size={18} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export const formStyles = StyleSheet.create({
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    paddingTop: Spacing.two,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four - 4,
    paddingVertical: Spacing.three - 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
});

const styles = StyleSheet.create({
  ...formStyles,
  sheet: {
    ...formStyles.sheet,
    maxHeight: '75%',
  },
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
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 50,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  fieldBoxError: {
    borderColor: C.danger,
  },
  fieldText: {
    flex: 1,
    color: C.text,
    fontSize: 16,
  },
  placeholder: {
    color: C.textMuted,
  },
  pressed: {
    opacity: 0.6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.four - 4,
  },
  optionDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  optionText: {
    flex: 1,
    color: C.text,
    fontSize: 16,
  },
  optionTextSelected: {
    color: C.primary,
    fontWeight: '600',
  },
});
