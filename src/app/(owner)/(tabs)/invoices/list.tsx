import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, TextInput, View } from 'react-native';

import { DocCard, KIND_LABEL, listTitle, ScreenHeader } from '@/components/owner/invoices-ui';
import { EmptyState, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { docsForList, isListFilter, useDocs, type DocKind } from '@/data/invoices';

// One page for every box on Invoices & Quotes (and "See more"):
// /invoices/list?kind=quote&status=Sent shows every Sent quote, newest first.
export default function DocListScreen() {
  const params = useLocalSearchParams<{ kind?: string; status?: string }>();
  const kind: DocKind = params.kind === 'quote' ? 'quote' : 'invoice';
  const filter = params.status && isListFilter(kind, params.status) ? params.status : 'all';
  const docs = useDocs();
  const [query, setQuery] = useState('');
  const label = KIND_LABEL[kind];

  const all = docsForList(docs, kind, filter);
  const q = query.trim().toLowerCase();
  const list = q
    ? all.filter((d) => d.client.name.toLowerCase().includes(q) || d.number.toLowerCase().includes(q))
    : all;

  const emptyMessage =
    all.length > 0
      ? `No ${label.many.toLowerCase()} match your search.`
      : filter === 'all'
        ? `No ${label.many.toLowerCase()} yet.`
        : `No ${filter.toLowerCase()} ${label.many.toLowerCase()}.`;

  // Back to Invoices & Quotes on the same side (Quotes or Invoices).
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/invoices', params: { kind } });

  return (
    <OwnerScreen>
      <ScreenHeader title={listTitle(kind, filter)} onBack={goBack} />

      {all.length > 0 && (
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
      )}

      {list.length === 0 ? (
        <EmptyState icon={OwnerIcons.receipt} message={emptyMessage} />
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
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  search: {
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
  list: {
    gap: Spacing.two,
  },
});
