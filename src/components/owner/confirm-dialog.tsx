import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';

/** Centered "are you sure?" pop-up with Cancel and a red destructive action. */
export function ConfirmDialog({
  visible,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityRole="alert">
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button label="Cancel" variant="secondary" onPress={onCancel} />
            </View>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              style={({ pressed }) => [styles.flex, styles.destructive, pressed && styles.pressed]}>
              <Text style={styles.destructiveText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    gap: Spacing.three,
    padding: Spacing.four - 4,
    borderRadius: Radius.large,
    backgroundColor: C.surface,
  },
  message: {
    color: C.text,
    fontSize: 16,
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  destructive: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.danger,
    backgroundColor: C.danger,
  },
  destructiveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
