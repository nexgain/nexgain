import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type PickerTheme = {
  sheet: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  dark: boolean;
};

export type NativePickerOptions = {
  mode: 'date' | 'time';
  value: Date;
  onChange: (value: Date) => void;
  title: string;
  theme: PickerTheme;
  minimumDate?: Date;
  maximumDate?: Date;
};

/**
 * Opens the platform date/time picker: Android system dialog, or an iOS bottom
 * sheet with Cancel / Done. Render `element` somewhere in the tree.
 */
export function useNativePicker({
  mode,
  value,
  onChange,
  title,
  theme,
  minimumDate,
  maximumDate,
}: NativePickerOptions): { open: () => void; element: ReactNode } {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const insets = useSafeAreaInsets();

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        minimumDate,
        maximumDate,
        onValueChange: (_event, date) => onChange(date),
      });
      return;
    }
    setDraft(value);
    setIosOpen(true);
  }

  const element =
    Platform.OS === 'ios' ? (
      <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIosOpen(false)} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 8 },
          ]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setIosOpen(false)} hitSlop={10}>
              <Text style={[styles.headerButton, { color: theme.muted }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Pressable
              onPress={() => {
                onChange(draft);
                setIosOpen(false);
              }}
              hitSlop={10}>
              <Text style={[styles.headerButton, styles.done, { color: theme.accent }]}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={draft}
            mode={mode}
            display={mode === 'date' ? 'inline' : 'spinner'}
            themeVariant={theme.dark ? 'dark' : 'light'}
            accentColor={theme.accent}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            minuteInterval={mode === 'time' ? 5 : undefined}
            onValueChange={(_event, date) => setDraft(date)}
            style={styles.picker}
          />
        </View>
      </Modal>
    ) : null;

  return { open, element };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerButton: {
    fontSize: 16,
  },
  done: {
    fontWeight: '700',
  },
  picker: {
    alignSelf: 'center',
  },
});
