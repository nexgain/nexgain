import { useState } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { AuthColors as C } from '@/components/auth/theme';

/** Labelled input with an icon; password fields get a show/hide eye button. */
export function AuthInput({
  label,
  icon,
  password = false,
  ...inputProps
}: {
  label: string;
  icon: SymbolViewProps['name'];
  password?: boolean;
} & TextInputProps) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <SymbolView name={icon} tintColor={focused ? C.brand : C.textSecondary} size={18} />
        <TextInput
          placeholderTextColor={C.textSecondary}
          secureTextEntry={password && hidden}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={styles.input}
        />
        {password && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={10}>
            <SymbolView
              name={
                hidden
                  ? { ios: 'eye', android: 'visibility', web: 'visibility' }
                  : { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
              }
              tintColor={C.textSecondary}
              size={18}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  label: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  boxFocused: {
    borderColor: C.brand,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    paddingVertical: 14,
  },
});
