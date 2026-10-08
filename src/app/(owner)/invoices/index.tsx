import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  boxLabel,
  DocCard,
  HeaderIconButton,
  KIND_LABEL,
  ScreenHeader,
  Segmented,
  SummaryTile,
  SUMMARY,
} from '@/components/owner/invoices-ui';
import { Button, Card, EmptyState, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Spacing } from '@/constants/theme';
import { docsForList, useDocs, type DocKind, type ListFilter, type SalesDoc } from '@/data/invoices';

const KINDS = [
  { value: 'invoice', label: 'Invoices' },
  { value: 'quote', label: 'Quotes' },
] as const;

/** How many of the newest quotes / invoices this screen shows before "See more". */
const RECENT_COUNT = 3;

const newDoc = (kind: DocKind) => router.push({ pathname: '/invoices/new', params: { kind } });
const openList = (kind: DocKind, status: ListFilter) =>
  router.push({ pathname: '/invoices/list', params: { kind, status } });

export default function InvoicesScreen() {
  const docs = useDocs();
  // A list page that was opened on its own comes back here with ?kind=, keeping its side.
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<DocKind>(params.kind === 'quote' ? 'quote' : 'invoice');
  const [seenParam, setSeenParam] = useState(params.kind);
  if (params.kind !== seenParam) {
    setSeenParam(params.kind);
    if (params.kind === 'quote' || params.kind === 'invoice') setKind(params.kind);
  }

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
          <SummaryTile
            key={s.label}
            label={s.label}
            value={docsForList(docs, kind, s.filter).length}
            tone={s.tone}
            spokenLabel={boxLabel(kind, s.filter)}
            onPress={() => openList(kind, s.filter)}
          />
        ))}
      </View>

      <RecentDocs kind={kind} docs={docs} />
    </OwnerScreen>
  );
}

function RecentDocs({ kind, docs }: { kind: DocKind; docs: SalesDoc[] }) {
  const label = KIND_LABEL[kind];
  const all = docsForList(docs, kind, 'all');
  const recent = all.slice(0, RECENT_COUNT);

  return (
    <Card title={`Recent ${label.many}`} icon={OwnerIcons.receipt}>
      {recent.length === 0 ? (
        <EmptyState icon={OwnerIcons.receipt} message={`No ${label.many.toLowerCase()} yet`} />
      ) : (
        <View style={styles.list}>
          {recent.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onPress={() => router.push({ pathname: '/invoices/[id]', params: { id: doc.id } })}
            />
          ))}
        </View>
      )}

      {all.length > RECENT_COUNT && (
        <Button label="See more" variant="secondary" onPress={() => openList(kind, 'all')} />
      )}

      <Button label={`Create New ${label.one}`} icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={() => newDoc(kind)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
});
