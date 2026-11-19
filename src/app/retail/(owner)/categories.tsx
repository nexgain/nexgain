// More > Product Categories (NexGain Retail): the groups the shop's products
// go in. They start as the presets for the business type picked at sign-up
// (e.g. a clothing brand: Tops, Bottoms, Dresses...). The owner can rename,
// add, delete and reorder them.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { ConfirmDialog } from '@/systems/retail/components/owner/confirm-dialog';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import {
  addCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
  useCategories,
  useRetailLoad,
  useRetailType,
  type ProductCategory,
} from '@/systems/retail/data/retail';

type Message = { tone: 'ok' | 'error'; text: string } | null;

const LIST_ICON = { ios: 'square.grid.2x2.fill', android: 'category', web: 'category' } as const;
const PLUS_ICON = { ios: 'plus', android: 'add', web: 'add' } as const;
const UP_ICON = { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' } as const;

export default function CategoriesScreen() {
  const categories = useCategories();
  const load = useRetailLoad();
  const type = useRetailType();
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ProductCategory | null>(null);

  async function run(action: () => Promise<string | null>, ok?: string) {
    setBusy(true);
    const error = await action();
    setBusy(false);
    setMessage(error ? { tone: 'error', text: error } : ok ? { tone: 'ok', text: ok } : null);
    return error;
  }

  async function add() {
    const name = newName.trim();
    const error = await run(() => addCategory(name), `${name} added.`);
    if (!error) setNewName('');
  }

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Product Categories"
        subtitle={
          type && !type.other
            ? `The groups your products go in. These started as the usual ones for a ${type.name.toLowerCase()}.`
            : 'The groups your products go in.'
        }
      />

      {message && (
        <Text style={[styles.message, message.tone === 'error' && styles.messageError]} accessibilityRole="alert">
          {message.text}
        </Text>
      )}

      <Card title={`Your Categories (${categories.length})`} icon={LIST_ICON}>
        {categories.length === 0 ? (
          <EmptyState
            icon={LIST_ICON}
            message={load === 'ready' || load === 'error' ? 'No categories yet. Add your first one below.' : 'Loading your categories…'}
          />
        ) : (
          categories.map((c, i) => (
            <CategoryRow
              key={c.id}
              category={c}
              first={i === 0}
              last={i === categories.length - 1}
              disabled={busy}
              onRename={(name) => run(() => renameCategory(c.id, name), 'Saved.')}
              onMove={(direction) => run(() => moveCategory(c.id, direction))}
              onDelete={() => setDeleting(c)}
            />
          ))
        )}
      </Card>

      <Card title="Add a Category" icon={PLUS_ICON}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={add}
          placeholder="e.g. Knitwear"
          placeholderTextColor={C.textMuted}
          maxLength={60}
          returnKeyType="done"
          accessibilityLabel="New category name"
          style={styles.input}
        />
        <Button label={busy ? 'Saving…' : 'Add category'} icon={PLUS_ICON} onPress={add} disabled={busy || !newName.trim()} />
      </Card>

      <ConfirmDialog
        visible={!!deleting}
        message={`Delete the ${deleting?.name ?? ''} category? Any products in it stay in your stock, with no category.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const c = deleting;
          setDeleting(null);
          if (c) run(() => deleteCategory(c.id), `${c.name} deleted.`);
        }}
        onCancel={() => setDeleting(null)}
      />
    </OwnerScreen>
  );
}

function CategoryRow({
  category,
  first,
  last,
  disabled,
  onRename,
  onMove,
  onDelete,
}: {
  category: ProductCategory;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  // What's being typed; saved when the field is left (or Done is pressed).
  const [text, setText] = useState<string | null>(null);
  const save = () => {
    if (text !== null && text.trim() !== category.name) onRename(text);
    setText(null);
  };

  return (
    <View style={[styles.row, !first && styles.divider]}>
      <TextInput
        value={text ?? category.name}
        onChangeText={setText}
        onBlur={save}
        onSubmitEditing={save}
        maxLength={60}
        returnKeyType="done"
        accessibilityLabel={`Rename ${category.name}`}
        style={[styles.input, styles.flex]}
      />
      <SmallButton label={`Move ${category.name} up`} icon={UP_ICON} disabled={disabled || first} onPress={() => onMove(-1)} />
      <SmallButton label={`Move ${category.name} down`} icon={OwnerIcons.chevronDown} disabled={disabled || last} onPress={() => onMove(1)} />
      <SmallButton
        label={`Delete ${category.name}`}
        icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
        danger
        disabled={disabled}
        onPress={onDelete}
      />
    </View>
  );
}

function SmallButton({
  label,
  icon,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  danger?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [styles.small, danger && styles.smallDanger, pressed && styles.pressed, disabled && styles.off]}>
      <Icon name={icon} color={danger ? C.danger : C.textSecondary} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  input: {
    minHeight: 44,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
    color: C.text,
    fontSize: 15,
  },
  small: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.surfaceRaised },
  smallDanger: { backgroundColor: C.dangerSoft },
  pressed: { opacity: 0.6 },
  off: { opacity: 0.3 },
  message: { color: C.success, fontSize: 14, fontWeight: '600' },
  messageError: { color: C.danger },
});
