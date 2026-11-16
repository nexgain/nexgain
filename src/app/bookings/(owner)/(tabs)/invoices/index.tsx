import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  boxLabel,
  DocCard,
  HeaderIconButton,
  KIND_LABEL,
  ScreenHeader,
  SummaryTile,
  SUMMARY,
} from '@/systems/bookings/components/owner/invoices-ui';
import { Button, Card, EmptyState, OwnerIcons, OwnerScreen } from '@/systems/bookings/components/owner/ui';
import { Spacing } from '@/constants/theme';
import { docsForList, useDocs, type DocKind, type ListFilter, type SalesDoc } from '@/data/invoices';

/** How many of the newest invoices this screen shows before "See more". */
const RECENT_COUNT = 3;

const newDoc = (kind: DocKind) => router.push({ pathname: '/bookings/invoices/new', params: { kind } });
const openList = (kind: DocKind, status: ListFilter) =>
  router.push({ pathname: '/bookings/invoices/list', params: { kind, status } });

// Invoices (NexGain Bookings): booking businesses don't use quotes, so this
// is invoices only (System 1 has Invoices & Quotes).
export default function InvoicesScreen() {
  const docs = useDocs();
  const kind: DocKind = 'invoice';

  return (
    <OwnerScreen>
      <ScreenHeader
        title="Invoices"
        onBack={() => router.navigate('/bookings/dashboard')}
        right={<HeaderIconButton icon="plus" label={`New ${KIND_LABEL[kind].one.toLowerCase()}`} onPress={() => newDoc(kind)} />}
      />

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
              onPress={() => router.push({ pathname: '/bookings/invoices/[id]', params: { id: doc.id } })}
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
