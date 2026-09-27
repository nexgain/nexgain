import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { OptionSheet } from '@/components/owner/form';
import {
  DocCard,
  HeaderIconButton,
  KIND_LABEL,
  ScreenHeader,
  Segmented,
  SummaryTile,
} from '@/components/owner/invoices-ui';
import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import {
  displayStatus,
  INVOICE_STATUSES,
  QUOTE_STATUSES,
  useDocs,
  type DocKind,
  type SalesDoc,
} from '@/data/invoices';

const KINDS = [
  { value: 'invoice', label: 'Invoices' },
  { value: 'quote', label: 'Quotes' },
] as const;

const SUMMARY = {
  invoice: [
    { label: 'Total Invoices', status: null, tone: 'blue' },
    { label: 'Pending', status: 'Pending', tone: 'amber' },
    { label: 'Paid', status: 'Paid', tone: 'green' },
    { label: 'Overdue', status: 'Overdue', tone: 'red' },
  ],
  quote: [
    { label: 'Total Quotes', status: null, tone: 'blue' },
    { label: 'Sent', status: 'Sent', tone: 'amber' },
    { label: 'Accepted', status: 'Accepted', tone: 'green' },
    { label: 'Expired', status: 'Expired', tone: 'red' },
  ],
} as const;

const newDoc = (kind: DocKind) => router.push({ pathname: '/invoices/new', params: { kind } });

export default function InvoicesScreen() {
  const docs = useDocs();
  const [kind, setKind] = useState<DocKind>('invoice');
  const otherKind: DocKind = kind === 'invoice' ? 'quote' : 'invoice';

  const count = (k: DocKind, status: string | null) =>
    docs.filter((d) => d.kind === k && (status === null || displayStatus(d) === status)).length;

  return (
    <OwnerScreen>
      <ScreenHeader
        title="Invoices & Quotes"
        onBack={() => router.navigate('/dashboard')}
        right={<HeaderIconButton icon="plus" label={`New ${KIND_LABEL[kind].one.toLowerCase()}`} onPress={() => newDoc(kind)} />}
      />

      <Segmented options={KINDS} value={kind} onChange={setKind} />

      <View style={styles.tiles}>
        {SUMMARY[kind].map((s) => (
          <SummaryTile key={s.label} label={s.label} value={count(kind, s.status)} tone={s.tone} />
        ))}
      </View>

      <DocSection kind={kind} docs={docs} showCreate />
      <DocSection kind={otherKind} docs={docs} />
    </OwnerScreen>
  );
}

function DocSection({ kind, docs, showCreate }: { kind: DocKind; docs: SalesDoc[]; showCreate?: boolean }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const label = KIND_LABEL[kind];

  const q = query.trim().toLowerCase();
  const list = docs.filter(
    (d) =>
      d.kind === kind &&
      (status === 'All' || displayStatus(d) === status) &&
      (!q || d.client.name.toLowerCase().includes(q) || d.number.toLowerCase().includes(q)),
  );
  const hasAny = docs.some((d) => d.kind === kind);

  return (
    <Card title={`Recent ${label.many}`} icon={OwnerIcons.receipt}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Icon name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} color={C.textSecondary} size={14} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${label.many.toLowerCase()}`}
            placeholderTextColor={C.textSecondary}
            style={styles.searchInput}
            accessibilityLabel={`Search ${label.many.toLowerCase()}`}
          />
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Filter ${label.many.toLowerCase()}`}
          style={({ pressed }) => [styles.filterButton, status !== 'All' && styles.filterActive, pressed && styles.pressed]}>
          <Icon
            name={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
            color={status !== 'All' ? '#FFFFFF' : C.text}
            size={16}
          />
        </Pressable>
      </View>
      {status !== 'All' && <Text style={styles.filterNote}>Showing: {status}</Text>}

      {list.length === 0 ? (
        <EmptyState
          icon={OwnerIcons.receipt}
          message={hasAny ? `No ${label.many.toLowerCase()} match your search.` : `No ${label.many.toLowerCase()} yet`}
        />
      ) : (
        <View style={styles.list}>
          {list.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onPress={() => router.push({ pathname: '/invoices/[id]', params: { id: doc.id } })}
            />
          ))}
        </View>
      )}

      {showCreate && (
        <Button label={`Create New ${label.one}`} icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={() => newDoc(kind)} />
      )}

      <OptionSheet
        visible={filterOpen}
        title={`Filter ${label.many.toLowerCase()}`}
        options={['All', ...(kind === 'invoice' ? INVOICE_STATUSES : QUOTE_STATUSES)]}
        value={status}
        onSelect={setStatus}
        onClose={() => setFilterOpen(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three - 4,
    minHeight: 42,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  filterButton: {
    width: 42,
    height: 42,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  filterNote: {
    color: C.textSecondary,
    fontSize: 13,
  },
  list: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
