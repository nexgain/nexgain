// Owner sign-up, NexGain Retail only: what kind of shop or brand this is.
// Only retail / stock-based types are shown (never service or booking types).
// "Other Retail" lets them type their own. The types and their preset product
// categories live in constants/retail-business-types.ts.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field, Icon, Input, SignupColors as C } from '@/components/signup/fields';
import type { SignupData } from '@/components/signup/types';
import { findRetailType, RETAIL_TYPES, type RetailBusinessType } from '@/systems/retail/constants/retail-business-types';

type Props = {
  data: SignupData;
  update: (changes: Partial<SignupData>) => void;
  hasError: boolean;
  error?: string | false;
};

export function RetailTypePicker({ data, update, hasError, error }: Props) {
  const chosen = findRetailType(data.retailType);

  function pick(type: RetailBusinessType) {
    // The industry saved on the business profile: the type's name (or what they type for "Other Retail").
    const name = type.other ? '' : type.name;
    update({ retailType: type.id, industry: name ? { name, category: 'Retail' } : null, industryText: name });
  }

  function typeOwn(text: string) {
    update({ industryText: text, industry: text.trim() ? { name: text.trim(), category: 'Retail' } : null });
  }

  return (
    <Field label="What type of business are you?" error={error}>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {RETAIL_TYPES.map((t) => {
          const on = t.id === chosen?.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => pick(t)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.name}. ${t.hint}`}
              style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && styles.pressed]}>
              <View style={[styles.cardIcon, on && styles.cardIconOn]}>
                <Icon name={t.icon} color={on ? C.onPrimary : C.primary} size={18} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardText} numberOfLines={2}>
                  {t.name}
                </Text>
                <Text style={styles.hint} numberOfLines={2}>
                  {t.hint}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {chosen?.other && (
        <Input
          value={data.industryText}
          onChangeText={typeOwn}
          placeholder="Your type of shop, e.g. Surf Shop"
          accessibilityLabel="Your type of shop"
          maxLength={80}
          hasError={hasError && !data.industryText.trim()}
        />
      )}
    </Field>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    flexGrow: 1,
    flexBasis: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  cardOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  cardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft },
  cardIconOn: { backgroundColor: C.primary },
  cardText: { color: C.text, fontSize: 14, fontWeight: '600' },
  hint: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
});
