// Owner sign-up step 4, NexGain Retail only: the product categories the shop
// starts with. Pre-filled from the business type picked in step 2 (that type
// only, never another's). The owner can rename, delete or add categories here,
// and again later in Stock › Categories.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Field, Icon, Note, SignupColors as C } from '@/components/signup/fields';
import type { SignupData, StepProps } from '@/components/signup/types';
import { cleanCategories, findRetailType, presetCategories } from '@/systems/retail/constants/retail-business-types';

/** What's stopping the owner moving on, or null. */
export function retailCategoriesProblem(data: Pick<SignupData, 'retailCategories'>) {
  if (cleanCategories(data.retailCategories).length === 0) return 'Add at least one product category.';
  return null;
}

export function StepRetailCategories({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);
  const type = findRetailType(data.retailType);

  // A new business type chosen: start from its preset categories.
  useEffect(() => {
    if (data.retailCategoriesFor === data.retailType) return;
    update({ retailCategoriesFor: data.retailType, retailCategories: presetCategories(data.retailType) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.retailType]);

  const list = data.retailCategories;
  const problem = retailCategoriesProblem(data);

  return (
    <>
      <Field
        label="Your product categories"
        hint={`Suggested for ${type && !type.other ? type.name.toLowerCase() : 'your shop'}. Rename, delete or add your own. You can change these later.`}>
        <View style={styles.list}>
          {list.map((c, i) => (
            <View key={c.key} style={styles.row}>
              <TextInput
                value={c.name}
                onChangeText={(name) => update({ retailCategories: list.map((x) => (x.key === c.key ? { ...x, name } : x)) })}
                placeholder="Category name"
                placeholderTextColor={C.muted}
                maxLength={60}
                accessibilityLabel={`Category ${i + 1}`}
                style={styles.input}
              />
              <Pressable
                onPress={() => update({ retailCategories: list.filter((x) => x.key !== c.key) })}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${c.name || 'this category'}`}
                hitSlop={8}
                style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
                <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.danger} size={16} />
              </Pressable>
            </View>
          ))}
          {list.length === 0 && <Text style={styles.muted}>No categories yet. Add your first one.</Text>}
        </View>
        <Button
          label="Add category"
          variant="secondary"
          icon={{ ios: 'plus', android: 'add', web: 'add' }}
          onPress={() => update({ retailCategories: [...list, { key: `custom:${Date.now()}`, name: '' }] })}
        />
        <Note>Products go in these categories, e.g. a black tee goes in Tops. Sizes and colours are added with each product.</Note>
      </Field>

      {tried && problem && <Text style={styles.error}>{problem}</Text>}
      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (!problem) onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.field,
    color: C.text,
    fontSize: 15,
  },
  delete: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.dangerSoft,
  },
  pressed: { opacity: 0.7 },
  muted: { color: C.textSecondary, fontSize: 14 },
  error: { color: C.danger, fontSize: 14, fontWeight: '600' },
});
