import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthColors as C } from '@/components/auth/theme';

/** Tappable card: green icon, bold title, grey subtitle and a ">" arrow. */
export function OptionCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <SymbolView name={icon} tintColor={C.brand} size={22} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        tintColor={C.textSecondary}
        size={16}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brandSoft,
  },
  text: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 14,
  },
});
