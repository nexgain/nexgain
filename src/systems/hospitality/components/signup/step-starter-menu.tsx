// Owner sign-up step 4, NexGain Hospitality only: the starter menu layout.
// The chosen business type suggests its menu categories (a Cafe gets Coffee,
// Breakfast, Lunch...). The owner can rename, add or delete them here, and
// change them any time later on the Menu page. Items and prices are added
// after sign-up.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Field, Icon, Input, Note, SignupColors as C } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';
import { cleanCategories } from '@/systems/hospitality/constants/hospitality-types';

export function StepStarterMenu({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);
  const [newName, setNewName] = useState('');
  const categories = data.menuCategories;
  const clean = cleanCategories(categories);
  const error = clean.length === 0 ? 'Add at least one category (you can change them later).' : null;

  const set = (next: string[]) => update({ menuCategories: next });

  function add() {
    const name = newName.trim();
    if (!name) return;
    set([...categories, name]);
    setNewName('');
  }

  return (
    <>
      <Note>These are the sections of your menu. Rename, add or delete them now, or any time later on the Menu page. You’ll add your items and prices after sign-up.</Note>

      <Field label="Menu categories" error={tried && error ? error : undefined}>
        <View style={styles.list}>
          {categories.map((name, i) => (
            <View key={i} style={styles.row}>
              <View style={styles.flex}>
                <Input
                  value={name}
                  onChangeText={(text) => set(categories.map((c, j) => (j === i ? text : c)))}
                  placeholder="Category name"
                  accessibilityLabel={`Category ${i + 1}`}
                  maxLength={60}
                />
              </View>
              <Pressable
                onPress={() => set(categories.filter((_, j) => j !== i))}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${name || 'category'}`}
                hitSlop={8}
                style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
                <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.textSecondary} size={16} />
              </Pressable>
            </View>
          ))}
        </View>
      </Field>

      <Field label="Add a category" optional>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Input
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Smoothies"
              accessibilityLabel="New category name"
              maxLength={60}
              onSubmitEditing={add}
              returnKeyType="done"
            />
          </View>
          <Pressable
            onPress={add}
            disabled={!newName.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add category"
            style={({ pressed }) => [styles.addButton, !newName.trim() && styles.disabled, pressed && styles.pressed]}>
            <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color={C.onPrimary} size={16} />
          </Pressable>
        </View>
      </Field>

      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (error) return;
          set(clean);
          onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  flex: { flex: 1 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
});
