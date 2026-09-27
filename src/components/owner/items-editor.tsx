import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { Icon } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { lineAmount, newItemId } from '@/data/invoices';
import { formatMoney } from '@/data/payroll';

/** An item row while editing; qty and rate stay as text so partial input like "1." works. */
export type EditItem = {
  id: string;
  description: string;
  qty: string;
  rate: string;
};

export const emptyItem = (): EditItem => ({ id: newItemId(), description: '', qty: '', rate: '' });

export const toNumber = (text: string) => {
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : 0;
};

/** Keeps digits and a single decimal point. */
const cleanNumber = (text: string) => text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

const WIDE = 560;
const ROW_GAP = Spacing.two;

/** Editable line items with drag-to-reorder, remove and live amounts. */
export function ItemsEditor({ items, onChange }: { items: EditItem[]; onChange: (items: EditItem[]) => void }) {
  const [width, setWidth] = useState(0);
  const wide = width >= WIDE;

  function update(id: string, changes: Partial<EditItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function move(from: number, to: number) {
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.editor}>
      {wide && items.length > 0 && (
        <View style={styles.headerRow}>
          <View style={styles.handleSpace} />
          <Text style={[styles.headerText, styles.descCol]}>Description</Text>
          <Text style={[styles.headerText, styles.qtyCol]}>Qty</Text>
          <Text style={[styles.headerText, styles.rateCol]}>Rate</Text>
          <Text style={[styles.headerText, styles.amountCol, styles.right]}>Amount</Text>
          <View style={styles.removeSpace} />
        </View>
      )}

      {items.length === 0 && <Text style={styles.empty}>No items yet. Add your first item below.</Text>}

      {items.map((item, index) => (
        <ItemRow
          key={item.id}
          item={item}
          index={index}
          count={items.length}
          wide={wide}
          onUpdate={(changes) => update(item.id, changes)}
          onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
          onMove={(to) => move(index, to)}
        />
      ))}

      <Pressable
        onPress={() => onChange([...items, emptyItem()])}
        accessibilityRole="button"
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
        <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color={C.accent} size={14} />
        <Text style={styles.addText}>Add Item</Text>
      </Pressable>
    </View>
  );
}

function ItemRow({
  item,
  index,
  count,
  wide,
  onUpdate,
  onRemove,
  onMove,
}: {
  item: EditItem;
  index: number;
  count: number;
  wide: boolean;
  onUpdate: (changes: Partial<EditItem>) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [translateY] = useState(() => new Animated.Value(0));
  const height = useRef(0);
  // Latest position info for the gesture handlers, which are created once.
  const latest = useRef({ index, count, onMove });
  useEffect(() => {
    latest.current = { index, count, onMove };
  });

  // eslint-disable-next-line react-hooks/refs -- refs are only read inside the gesture callbacks, never during render.
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: (_e, g) => translateY.setValue(g.dy),
      onPanResponderRelease: (_e, g) => {
        const { index: from, count: total, onMove: move } = latest.current;
        const step = height.current + ROW_GAP || 1;
        const to = Math.max(0, Math.min(total - 1, from + Math.round(g.dy / step)));
        translateY.setValue(0);
        setDragging(false);
        move(to);
      },
      onPanResponderTerminate: () => {
        translateY.setValue(0);
        setDragging(false);
      },
    }),
  );

  const amount = lineAmount({ qty: toNumber(item.qty), rate: toNumber(item.rate) });

  const handle = (
    <View
      {...responder.panHandlers}
      accessibilityLabel={`Reorder item ${index + 1}`}
      style={styles.handle}>
      <Icon name={{ ios: 'line.3.horizontal', android: 'drag_indicator', web: 'drag_indicator' }} color={C.textSecondary} size={16} />
    </View>
  );
  const remove = (
    <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove item ${index + 1}`} style={styles.remove}>
      <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.textSecondary} size={14} />
    </Pressable>
  );
  const description = (
    <TextInput
      value={item.description}
      onChangeText={(description) => onUpdate({ description })}
      placeholder="Description"
      placeholderTextColor={C.textSecondary}
      style={[styles.input, wide ? styles.descCol : styles.flex]}
      accessibilityLabel={`Item ${index + 1} description`}
    />
  );
  const qty = (
    <TextInput
      value={item.qty}
      onChangeText={(t) => onUpdate({ qty: cleanNumber(t) })}
      placeholder="0"
      placeholderTextColor={C.textSecondary}
      keyboardType="decimal-pad"
      style={[styles.input, styles.number, wide ? styles.qtyCol : styles.flex]}
      accessibilityLabel={`Item ${index + 1} quantity`}
    />
  );
  const rate = (
    <TextInput
      value={item.rate}
      onChangeText={(t) => onUpdate({ rate: cleanNumber(t) })}
      placeholder="0.00"
      placeholderTextColor={C.textSecondary}
      keyboardType="decimal-pad"
      style={[styles.input, styles.number, wide ? styles.rateCol : styles.flex]}
      accessibilityLabel={`Item ${index + 1} rate`}
    />
  );
  const amountText = <Text style={[styles.amount, wide ? styles.amountCol : styles.flex]}>{formatMoney(amount)}</Text>;

  return (
    <Animated.View
      onLayout={(e: LayoutChangeEvent) => {
        height.current = e.nativeEvent.layout.height;
      }}
      style={[
        styles.row,
        dragging && styles.rowDragging,
        { transform: [{ translateY }], zIndex: dragging ? 10 : 0 },
      ]}>
      {wide ? (
        <View style={styles.line}>
          {handle}
          {description}
          {qty}
          {rate}
          {amountText}
          {remove}
        </View>
      ) : (
        <>
          <View style={styles.line}>
            {handle}
            {description}
            {remove}
          </View>
          <View style={[styles.line, styles.subLine]}>
            <View style={styles.flex}>
              <Text style={styles.smallLabel}>Qty</Text>
              {qty}
            </View>
            <View style={styles.flex}>
              <Text style={styles.smallLabel}>Rate</Text>
              {rate}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.smallLabel, styles.right]}>Amount</Text>
              {amountText}
            </View>
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  editor: {
    gap: ROW_GAP,
  },
  flex: {
    flex: 1,
  },
  right: {
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  headerText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  handleSpace: {
    width: 24,
  },
  removeSpace: {
    width: 24,
  },
  descCol: {
    flex: 1,
  },
  qtyCol: {
    width: 64,
  },
  rateCol: {
    width: 90,
  },
  amountCol: {
    width: 96,
  },
  empty: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
  row: {
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
    gap: Spacing.two,
  },
  rowDragging: {
    borderColor: C.accent,
    opacity: 0.95,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  subLine: {
    alignItems: 'flex-end',
    paddingLeft: 32,
  },
  handle: {
    width: 24,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    width: 24,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 38,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.medium - 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    color: C.text,
    fontSize: 15,
  },
  number: {
    textAlign: 'right',
  },
  amount: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    paddingVertical: Spacing.two,
  },
  smallLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.accent,
  },
  addText: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '600',
  },
});
