import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FieldButton, formStyles } from '@/components/employee/form-fields';
import { Icons } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { formatShortDate } from '@/data/employee-roster';

export type DateFieldProps = {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  clearable?: boolean;
  hasError?: boolean;
};

/** Native date field: Android system dialog, iOS inline calendar in a bottom sheet. */
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
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(() => value ?? new Date());
  const insets = useSafeAreaInsets();

  function open() {
    const initial = value ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_event, date) => onChange(date),
      });
      return;
    }
    setDraft(initial);
    setIosOpen(true);
  }

  return (
    <>
      <FieldButton
        value={value ? formatShortDate(value) : null}
        placeholder={placeholder}
        icon={Icons.calendar}
        onPress={open}
        onClear={clearable ? () => onChange(null) : undefined}
        hasError={hasError}
        accessibilityLabel={label}
      />
      {Platform.OS === 'ios' && (
        <Modal
          visible={iosOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIosOpen(false)}>
          <Pressable style={formStyles.backdrop} onPress={() => setIosOpen(false)} />
          <View style={[formStyles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
            <View style={formStyles.sheetHeader}>
              <Pressable onPress={() => setIosOpen(false)} hitSlop={10}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Text style={formStyles.sheetTitle}>{label}</Text>
              <Pressable
                onPress={() => {
                  onChange(draft);
                  setIosOpen(false);
                }}
                hitSlop={10}>
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              themeVariant="light"
              accentColor={C.primary}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onValueChange={(_event, date) => setDraft(date)}
              style={styles.picker}
            />
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cancel: {
    color: C.textSecondary,
    fontSize: 16,
  },
  done: {
    color: C.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  picker: {
    alignSelf: 'center',
  },
});
