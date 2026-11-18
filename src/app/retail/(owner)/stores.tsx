// More > Store Locations (NexGain Retail): the shop's stores. With one store
// (or none listed) nothing else changes. With two or more, the Roster asks
// which store each shift is at (and later, stock is counted per store).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ConfirmDialog } from '@/systems/retail/components/owner/confirm-dialog';
import { Button, Card, EmptyState, goBack, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { deleteStore, saveStore, useRetailLoad, useStores, type StoreLocation } from '@/systems/retail/data/retail';

type Message = { tone: 'ok' | 'error'; text: string } | null;
type Draft = { id: string | null; name: string; address: string };

const PIN = { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' } as const;
const EMPTY: Draft = { id: null, name: '', address: '' };

export default function StoresScreen() {
  const stores = useStores();
  const load = useRetailLoad();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<StoreLocation | null>(null);

  async function save() {
    setBusy(true);
    const error = await saveStore(draft);
    setBusy(false);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: draft.id ? 'Store saved.' : `${draft.name.trim()} added.` });
    if (!error) setDraft(EMPTY);
  }

  async function remove(store: StoreLocation) {
    setBusy(true);
    const error = await deleteStore(store.id);
    setBusy(false);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: `${store.name} deleted.` });
    if (!error && draft.id === store.id) setDraft(EMPTY);
  }

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Store Locations"
        subtitle="Only needed if you have more than one store. Then the Roster asks which store each shift is at."
      />

      {message && (
        <Text style={[styles.message, message.tone === 'error' && styles.messageError]} accessibilityRole="alert">
          {message.text}
        </Text>
      )}

      <Card title={`Your Stores (${stores.length})`} icon={PIN}>
        {stores.length === 0 ? (
          <EmptyState icon={PIN} message={load === 'loading' ? 'Loading your stores…' : 'No stores listed. With one shop, you don’t need any.'} />
        ) : (
          stores.map((s, i) => (
            <View key={s.id} style={[styles.row, i > 0 && styles.divider]}>
              <Pressable
                onPress={() => setDraft({ id: s.id, name: s.name, address: s.address })}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${s.name}`}
                style={({ pressed }) => [styles.flex, pressed && styles.pressed]}>
                <Text style={styles.name}>{s.name}</Text>
                {s.address ? <Text style={styles.muted}>{s.address}</Text> : null}
              </Pressable>
              <Pressable
                onPress={() => setDeleting(s)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${s.name}`}
                hitSlop={4}
                style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
                <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.danger} size={16} />
              </Pressable>
            </View>
          ))
        )}
        {stores.length === 1 && <Text style={styles.muted}>Add a second store to choose a store for each shift.</Text>}
      </Card>

      <Card title={draft.id ? 'Edit Store' : 'Add a Store'} icon={PIN}>
        <TextInput
          value={draft.name}
          onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
          placeholder="Store name, e.g. Bondi"
          placeholderTextColor={C.textMuted}
          maxLength={80}
          accessibilityLabel="Store name"
          style={styles.input}
        />
        <TextInput
          value={draft.address}
          onChangeText={(address) => setDraft((d) => ({ ...d, address }))}
          placeholder="Address (optional)"
          placeholderTextColor={C.textMuted}
          maxLength={200}
          accessibilityLabel="Store address"
          style={styles.input}
        />
        <View style={styles.buttons}>
          {draft.id && (
            <View style={styles.flex}>
              <Button fill label="Cancel" variant="secondary" onPress={() => setDraft(EMPTY)} />
            </View>
          )}
          <View style={styles.flex}>
            <Button fill label={busy ? 'Saving…' : draft.id ? 'Save store' : 'Add store'} onPress={save} disabled={busy || !draft.name.trim()} />
          </View>
        </View>
      </Card>

      <ConfirmDialog
        visible={!!deleting}
        message={`Delete ${deleting?.name ?? 'this store'}? Shifts already rostered there keep the store's name.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const s = deleting;
          setDeleting(null);
          if (s) remove(s);
        }}
        onCancel={() => setDeleting(null)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two + 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 13 },
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
  buttons: { flexDirection: 'row', gap: Spacing.two },
  delete: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.dangerSoft },
  pressed: { opacity: 0.6 },
  message: { color: C.success, fontSize: 14, fontWeight: '600' },
  messageError: { color: C.danger },
});
