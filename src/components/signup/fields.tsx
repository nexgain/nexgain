import { useState, type ReactNode } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

export type IconName = SymbolViewProps['name'];

export const SignupColors = {
  sidebar: '#0B0D12',
  sidebarMuted: '#8A93A6',
  page: '#FFFFFF',
  card: '#FFFFFF',
  field: '#F8FAFC',
  border: '#E2E8F0',
  text: '#0F172A',
  textSecondary: '#64748B',
  muted: '#94A3B8',
  primary: '#2563EB',
  primarySoft: '#EFF4FF',
  done: '#16A34A',
  green: '#1FD98A',
  onGreen: '#07130D',
  danger: '#DC2626',
} as const;

const C = SignupColors;

export function Icon({ name, color, size = 16 }: { name: IconName; color: string; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export function Field({
  label,
  optional,
  error,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string | false;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> (optional)</Text> : null}
      </Text>
      {children}
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Input({
  icon,
  hasError,
  password,
  style,
  ...props
}: TextInputProps & { icon?: IconName; hasError?: boolean; password?: boolean }) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.box, focused && styles.boxFocused, hasError && styles.boxError, props.editable === false && styles.boxDisabled]}>
      {icon ? <Icon name={icon} color={focused ? C.primary : C.muted} size={16} /> : null}
      <TextInput
        placeholderTextColor={C.muted}
        secureTextEntry={password && hidden}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, props.editable === false && styles.inputDisabled, style]}
      />
      {password && (
        <Pressable
          onPress={() => setHidden((h) => !h)}
          accessibilityRole="button"
          accessibilityLabel={hidden ? `Show ${props.accessibilityLabel ?? 'password'}` : `Hide ${props.accessibilityLabel ?? 'password'}`}
          hitSlop={10}>
          <Icon
            name={hidden ? { ios: 'eye', android: 'visibility', web: 'visibility' } : { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }}
            color={C.muted}
            size={18}
          />
        </Pressable>
      )}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  arrow,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'green' | 'secondary' | 'ghost';
  arrow?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const textColor = variant === 'primary' ? '#FFFFFF' : variant === 'green' ? C.onGreen : variant === 'ghost' ? C.textSecondary : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}>
      {icon ? <Icon name={icon} color={textColor} size={16} /> : null}
      <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
      {arrow ? <Icon name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} color={textColor} size={16} /> : null}
    </Pressable>
  );
}

export function YesNo({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <View style={styles.yesNo} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[true, false].map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={String(option)}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.yesNoOption, selected && styles.yesNoSelected]}>
            <Text style={[styles.yesNoText, selected && styles.yesNoTextSelected]}>{option ? 'Yes' : 'No'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked ? <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color="#FFFFFF" size={11} /> : null}
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

export const fieldStyles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex: {
    flex: 1,
  },
});

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  label: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  optional: {
    color: C.muted,
    fontWeight: '400',
  },
  hint: {
    color: C.textSecondary,
    fontSize: 13,
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  boxFocused: {
    borderColor: C.primary,
    backgroundColor: '#FFFFFF',
  },
  boxError: {
    borderColor: C.danger,
  },
  boxDisabled: {
    backgroundColor: '#F1F5F9',
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    paddingVertical: 12,
  },
  inputDisabled: {
    color: C.textSecondary,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: C.primary,
  },
  green: {
    backgroundColor: C.green,
  },
  secondary: {
    backgroundColor: '#FFFFFF',
    borderColor: C.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  yesNo: {
    flexDirection: 'row',
    gap: 10,
  },
  yesNoOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  yesNoSelected: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  yesNoText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  yesNoTextSelected: {
    color: C.primary,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  note: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
