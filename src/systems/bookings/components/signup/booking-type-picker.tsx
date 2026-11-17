// Owner sign-up, NexGain Bookings only: what kind of booking business this is.
// Category cards -> a searchable list of types (one type per business; its
// services are never mixed with another type's). "Other – enter my own" lets
// them type their own. The types and their preset services all live in
// constants/booking-business-types.ts.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field, Icon, Input, SignupColors as C } from '@/components/signup/fields';
import type { SignupData } from '@/components/signup/types';
import {
  BOOKING_CATEGORIES,
  findBookingCategory,
  findBookingType,
  searchBookingTypes,
  type BookingBusinessType,
} from '@/systems/bookings/constants/booking-business-types';

type Props = {
  data: SignupData;
  update: (changes: Partial<SignupData>) => void;
  hasError: boolean;
  error?: string | false;
};

const check = { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } as const;

/** The industry saved on the business profile: the main type's name (or what they typed). */
function industryFor(type: BookingBusinessType, own: string) {
  const category = findBookingCategory(type.categoryId);
  return { name: type.other ? own.trim() : type.name, category: category?.name ?? null };
}

export function BookingTypePicker({ data, update, hasError, error }: Props) {
  const main = data.bookingTypes[0] ? findBookingType(data.bookingTypes[0]) : null;
  const [categoryId, setCategoryId] = useState<string | null>(main?.categoryId ?? null);
  const [query, setQuery] = useState('');
  const [own, setOwn] = useState(main?.other ? data.industryText : '');
  const category = categoryId ? findBookingCategory(categoryId) : null;

  function pickMain(type: BookingBusinessType) {
    if (type.categoryId !== categoryId) setCategoryId(type.categoryId);
    const industry = industryFor(type, own);
    update({ bookingTypes: [type.id], industry: industry.name ? industry : null, industryText: industry.name });
    setQuery('');
  }

  function typeOwn(text: string) {
    setOwn(text);
    if (main?.other) {
      const industry = industryFor(main, text);
      update({ industry: industry.name ? industry : null, industryText: industry.name });
    }
  }

  // 1. Category cards (or search every type at once).
  if (!category) {
    const found = query.trim() ? searchBookingTypes(query, null).filter((t) => !t.other).slice(0, 8) : [];
    return (
      <Field label="What type of business are you?" error={error}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search, e.g. barber, nails, massage"
          accessibilityLabel="Search business types"
          icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          hasError={hasError}
        />
        {found.length > 0 ? (
          <View style={styles.list}>
            {found.map((t) => (
              <TypeRow key={t.id} type={t} selected={false} onPress={() => pickMain(t)} showCategory />
            ))}
          </View>
        ) : query.trim() ? (
          <Text style={styles.muted}>No match. Choose a category below and pick “Other – enter my own”.</Text>
        ) : null}
        <View style={styles.grid}>
          {BOOKING_CATEGORIES.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCategoryId(c.id)}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={styles.cardIcon}>
                <Icon name={c.icon} color={C.primary} size={18} />
              </View>
              <Text style={styles.cardText} numberOfLines={2}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>
    );
  }

  // 2. The types in that category (one type only: their services are never mixed with another type's).
  const types = searchBookingTypes(query, category.id);
  return (
    <>
      <Field label="What type of business are you?" error={error}>
        <View style={styles.chosenCategory}>
          <Icon name={category.icon} color={C.primary} size={16} />
          <Text style={styles.categoryName}>{category.name}</Text>
          <Pressable
            onPress={() => {
              setCategoryId(null);
              setQuery('');
              update({ bookingTypes: [], industry: null, industryText: '' });
            }}
            accessibilityRole="button"
            accessibilityLabel="Change category"
            hitSlop={8}>
            <Text style={styles.link}>Change</Text>
          </Pressable>
        </View>
        {category.types.length > 8 && (
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${category.name.toLowerCase()}`}
            accessibilityLabel="Search business types"
            icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          />
        )}
        <View style={styles.list} accessibilityRole="radiogroup">
          {types.map((t) => (
            <TypeRow key={t.id} type={t} selected={main?.id === t.id} onPress={() => pickMain(t)} />
          ))}
        </View>
        {main?.other && (
          <Input
            value={own}
            onChangeText={typeOwn}
            placeholder="Your type of business, e.g. Pottery Classes"
            accessibilityLabel="Your type of business"
            maxLength={80}
            hasError={hasError && !own.trim()}
          />
        )}
      </Field>
    </>
  );
}

function TypeRow({ type, selected, onPress, showCategory }: { type: BookingBusinessType; selected: boolean; onPress: () => void; showCategory?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={type.name}
      style={({ pressed }) => [styles.row, selected && styles.rowOn, pressed && styles.pressed]}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{type.name}</Text>
        {showCategory && <Text style={styles.muted}>{findBookingCategory(type.categoryId)?.name}</Text>}
      </View>
      {selected && <Icon name={check} color={C.primary} size={20} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    minHeight: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  cardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft },
  cardText: { flex: 1, color: C.text, fontSize: 14, fontWeight: '600' },
  chosenCategory: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryName: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600' },
  link: { color: C.primary, fontSize: 14, fontWeight: '600' },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  rowOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '500' },
});
