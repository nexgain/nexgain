// Owner sign-up, NexGain Hospitality only: what kind of food & drink business
// this is (Restaurant, Cafe, Bar / Pub...). "Other food business" lets them
// type their own. The types and their starter menus live in
// constants/hospitality-types.ts.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field, Icon, Input, SignupColors as C } from '@/components/signup/fields';
import type { SignupData } from '@/components/signup/types';
import { findHospitalityType, HOSPITALITY_GROUP, HOSPITALITY_TYPES, type HospitalityType } from '@/systems/hospitality/constants/hospitality-types';

type Props = {
  data: SignupData;
  update: (changes: Partial<SignupData>) => void;
  hasError: boolean;
  error?: string | false;
};

const check = { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } as const;

export function HospitalityTypePicker({ data, update, hasError, error }: Props) {
  const chosen = findHospitalityType(data.hospitalityType);
  const [own, setOwn] = useState(chosen?.other ? data.industryText : '');

  function pick(type: HospitalityType) {
    const name = type.other ? own.trim() : type.name;
    update({
      hospitalityType: type.id,
      industry: name ? { name, category: HOSPITALITY_GROUP } : null,
      industryText: name,
    });
  }

  function typeOwn(text: string) {
    setOwn(text);
    const name = text.trim();
    update({ industry: name ? { name, category: HOSPITALITY_GROUP } : null, industryText: name });
  }

  return (
    <Field label="What type of food business are you?" error={error}>
      <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={HOSPITALITY_GROUP}>
        {HOSPITALITY_TYPES.map((t) => {
          const selected = chosen?.id === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => pick(t)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t.name}
              style={({ pressed }) => [styles.row, selected && styles.rowOn, pressed && styles.pressed]}>
              <View style={styles.icon}>
                <Icon name={t.icon} color={C.primary} size={16} />
              </View>
              <Text style={styles.rowTitle}>{t.name}</Text>
              {selected && <Icon name={check} color={C.primary} size={20} />}
            </Pressable>
          );
        })}
      </View>
      {chosen?.other && (
        <Input
          value={own}
          onChangeText={typeOwn}
          placeholder="Your type of business, e.g. Noodle Bar"
          accessibilityLabel="Your type of food business"
          maxLength={80}
          hasError={hasError && !own.trim()}
        />
      )}
    </Field>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  rowOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft },
  rowTitle: { flex: 1, color: C.text, fontSize: 15, fontWeight: '500' },
});
