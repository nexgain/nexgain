import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors as C, Spacing } from '@/constants/theme';

export type Column<Row> = {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right';
  render: (row: Row) => ReactNode;
};

/** Simple data table; scrolls horizontally when wider than the screen. */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  footer,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyMessage: string;
  /** Cells for a totals row, keyed by column key. */
  footer?: Partial<Record<string, ReactNode>>;
}) {
  const minWidth = columns.reduce((sum, c) => sum + c.width, 0);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={[styles.table, { minWidth }]}>
          <View style={[styles.row, styles.headerRow]}>
            {columns.map((c) => (
              <Text key={c.key} style={[styles.headerCell, cellStyle(c)]}>
                {c.label}
              </Text>
            ))}
          </View>

          {rows.map((row) => (
            <View key={rowKey(row)} style={[styles.row, styles.bodyRow]}>
              {columns.map((c) => (
                <View key={c.key} style={[styles.cell, cellStyle(c)]}>
                  <Cell>{c.render(row)}</Cell>
                </View>
              ))}
            </View>
          ))}

          {footer && rows.length > 0 && (
            <View style={[styles.row, styles.footerRow]}>
              {columns.map((c) => (
                <View key={c.key} style={[styles.cell, cellStyle(c)]}>
                  <Cell bold>{footer[c.key] ?? ''}</Cell>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      {/* Outside the horizontal scroll so it stays centred on narrow screens. */}
      {rows.length === 0 && <Text style={styles.empty}>{emptyMessage}</Text>}
    </View>
  );
}

function Cell({ children, bold }: { children: ReactNode; bold?: boolean }) {
  if (typeof children === 'string' || typeof children === 'number') {
    return <Text style={[styles.cellText, bold && styles.bold]}>{children}</Text>;
  }
  return <>{children}</>;
}

function cellStyle<Row>(c: Column<Row>) {
  return {
    flexBasis: c.width,
    flexGrow: 1,
    alignItems: c.align === 'right' ? ('flex-end' as const) : ('flex-start' as const),
    textAlign: c.align === 'right' ? ('right' as const) : ('left' as const),
  };
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  table: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  headerRow: {
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerCell: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: Spacing.two,
  },
  bodyRow: {
    paddingVertical: Spacing.three - 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  footerRow: {
    paddingVertical: Spacing.three - 4,
  },
  cell: {
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
  cellText: {
    color: C.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  bold: {
    fontWeight: '700',
  },
  empty: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
  },
});
