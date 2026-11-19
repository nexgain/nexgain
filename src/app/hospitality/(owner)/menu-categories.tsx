import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { TextField } from '@/components/owner/form';
import { Button, Card, EmptyState, goBack, Icon, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { MenuIcons } from '@/systems/hospitality/components/owner/menu-ui';
import {
  addCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
  useMenuCategories,
  useMenuItems,
  type MenuCategory,
} from '@/systems/hospitality/data/menu';

// The menu's sections (Coffee, Breakfast...): rename, reorder, add or delete.
// Deleting a category keeps its items, under "No category".
export default function MenuCategoriesScreen() {
  const categories = [...useMenuCategories()].sort((a, b) => a.sort - b.sort);
  const items = useMenuItems();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MenuCategory | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      return false;
    }
  }

  async function add() {
    if (await run(() => addCategory(newName))) setNewName('');
  }

  const countOf = (id: string) => items.filter((i) => i.categoryId === id).length;

  return (
    <OwnerScreen>
      <PageHeader title="Menu categories" subtitle="The sections of your menu, in the order they’re shown." onBack={() => goBack('/hospitality/menu-items')} />

      <Card>
        {categories.length === 0 ? (
          <EmptyState icon={MenuIcons.category} message="No categories yet. Add your first one below, e.g. Coffee or Mains." />
        ) : (
          <View>
            {categories.map((c, i) => (
              <CategoryRow
                key={c.id}
                category={c}
                count={countOf(c.id)}
                first={i === 0}
                last={i === categories.length - 1}
                onRename={(name) => run(() => renameCategory(c.id, name))}
                onMove={(d) => run(() => moveCategory(c.id, d))}
                onDelete={() => setDeleting(c)}
              />
            ))}
          </View>
        )}
      </Card>

      <Card title="Add a category" icon={MenuIcons.plus}>
        <TextField value={newName} onChangeText={setNewName} placeholder="e.g. Smoothies" maxLength={60} onSubmitEditing={add} returnKeyType="done" accessibilityLabel="New category name" />
        <Button label="Add category" onPress={add} disabled={!newName.trim()} />
      </Card>

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <ConfirmDialog
        visible={deleting !== null}
        message={
          deleting
            ? `Delete “${deleting.name}”?${countOf(deleting.id) ? ` Its ${countOf(deleting.id)} item${countOf(deleting.id) === 1 ? '' : 's'} stay on your menu under “No category”.` : ''}`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => {
          const c = deleting;
          setDeleting(null);
          if (c) run(() => deleteCategory(c.id));
        }}
        onCancel={() => setDeleting(null)}
      />
    </OwnerScreen>
  );
}

function CategoryRow({
  category,
  count,
  first,
  last,
  onRename,
  onMove,
  onDelete,
}: {
  category: MenuCategory;
  count: number;
  first: boolean;
  last: boolean;
  onRename: (name: string) => Promise<boolean>;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  // Saved when the owner finishes typing (leaves the field or presses done).
  async function commit() {
    if (name.trim() === category.name) return;
    if (!(await onRename(name))) setName(category.name);
  }
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <View style={styles.flex}>
        <TextField value={name} onChangeText={setName} onBlur={commit} onSubmitEditing={commit} returnKeyType="done" maxLength={60} accessibilityLabel={`Rename ${category.name}`} />
        <Text style={styles.muted}>
          {count} item{count === 1 ? '' : 's'}
        </Text>
      </View>
      <IconButton icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' }} label={`Move ${category.name} up`} disabled={first} onPress={() => onMove(-1)} />
      <IconButton icon={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }} label={`Move ${category.name} down`} disabled={last} onPress={() => onMove(1)} />
      <IconButton icon={{ ios: 'trash', android: 'delete', web: 'delete' }} label={`Delete ${category.name}`} onPress={onDelete} danger />
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}>
      <Icon name={icon} color={danger ? C.danger : C.textSecondary} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  iconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  muted: { color: C.textSecondary, fontSize: 12 },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
});
