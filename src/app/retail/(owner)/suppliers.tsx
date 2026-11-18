// Suppliers tab (NexGain Retail): the manufacturers and suppliers the shop
// orders from. "Connected" means NexGain can send them orders (they have an
// email address). Each card shows the contact, how long deliveries take and
// what they supply, with buttons to order, call, email or edit.
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ConfirmDialog } from '@/systems/retail/components/owner/confirm-dialog';
import { IconSquare, Panel, Pill } from '@/systems/retail/components/owner/retail-ui';
import { QuantityBox, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, EmptyState, goBack, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { deleteSupplier, isConnected, saveSupplier, useProducts, useSuppliers, type Supplier, type SupplierDraft } from '@/systems/retail/data/stock';

const EMPTY: SupplierDraft = { id: null, name: '', contactName: '', phone: '', email: '', website: '', notes: '', leadTimeDays: 7 };

export default function SuppliersScreen() {
  const suppliers = useSuppliers();
  const products = useProducts().filter((p) => !p.archived);
  const [draft, setDraft] = useState<SupplierDraft | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const connected = suppliers.filter(isConnected).length;

  async function save() {
    if (!draft) return;
    setBusy(true);
    const r = await saveSupplier(draft);
    setBusy(false);
    if ('error' in r) return setMessage({ tone: 'error', text: r.error });
    setMessage({ tone: 'ok', text: `${r.supplier.name} saved${isConnected(r.supplier) ? ' and connected' : ''}.` });
    setDraft(null);
  }

  const field = (key: 'name' | 'contactName' | 'phone' | 'email' | 'website' | 'notes', placeholder: string, extra: Partial<ComponentProps<typeof TextInput>> = {}) => (
    <TextInput
      value={draft?.[key] ?? ''}
      onChangeText={(v) => setDraft((d) => (d ? { ...d, [key]: v } : d))}
      placeholder={placeholder}
      placeholderTextColor={C.textMuted}
      accessibilityLabel={placeholder}
      style={stockStyles.input}
      {...extra}
    />
  );

  return (
    <OwnerScreen>
      <PageHeader
        // On the phone it opens from More, so it has a back arrow (on a computer it's in the side menu: no arrow).
        onBack={() => goBack('/retail/menu')}
        title="Suppliers"
        subtitle={suppliers.length === 0 ? 'Who you buy stock from.' : `${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'} · ${connected} connected`}
        right={!draft ? <Button label="Add" icon={StockIcons.plus} onPress={() => setDraft(EMPTY)} /> : undefined}
      />

      {message && (
        <Text style={message.tone === 'ok' ? stockStyles.message : stockStyles.error} accessibilityRole="alert">
          {message.text}
        </Text>
      )}

      {draft && (
        <Panel>
          <Text style={styles.formTitle}>{draft.id ? 'Edit Supplier' : 'Add a Supplier'}</Text>
          {field('name', 'Business name, e.g. Apparel Manufacturing Co.', { maxLength: 100 })}
          {field('contactName', 'Contact person (optional)', { maxLength: 100 })}
          {field('email', 'Email (to send orders to)', { keyboardType: 'email-address', autoCapitalize: 'none', maxLength: 200 })}
          {field('phone', 'Phone (optional)', { keyboardType: 'phone-pad', maxLength: 40 })}
          {field('website', 'Website (optional)', { autoCapitalize: 'none', maxLength: 200 })}
          <View style={styles.leadRow}>
            <View style={styles.flex}>
              <Text style={styles.label}>Delivery time (days)</Text>
              <Text style={stockStyles.muted}>How long their orders usually take to arrive. The AI uses it to tell you when to reorder.</Text>
            </View>
            <QuantityBox value={draft.leadTimeDays} onChange={(leadTimeDays) => setDraft((d) => (d ? { ...d, leadTimeDays } : d))} label="delivery days" />
          </View>
          {field('notes', 'Notes, e.g. account number or minimum order (optional)', { multiline: true, maxLength: 1000 })}
          <Text style={stockStyles.muted}>With an email address, the supplier is Connected: orders you place are emailed to them from your email.</Text>
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button fill label="Cancel" variant="secondary" onPress={() => setDraft(null)} />
            </View>
            <View style={styles.flex}>
              <Button fill label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy || !draft.name.trim()} />
            </View>
          </View>
        </Panel>
      )}

      {suppliers.length === 0 && !draft ? (
        <Panel>
          <EmptyState icon={StockIcons.factory} message="No suppliers yet. Add your manufacturer or supplier to order stock from them." />
        </Panel>
      ) : (
        suppliers.map((s) => {
          const theirs = products.filter((p) => p.supplierId === s.id);
          const on = isConnected(s);
          return (
            <Panel key={s.id}>
              <View style={styles.head}>
                <IconSquare icon={StockIcons.factory} size={48} />
                <View style={styles.flex}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Pill label={on ? 'Connected' : 'Add an email to connect'} tone={on ? 'success' : 'neutral'} icon={on ? StockIcons.link : undefined} />
                </View>
              </View>
              <Text style={stockStyles.muted}>
                {[s.contactName, s.email, s.phone].filter(Boolean).join(' · ') || 'No contact details yet.'}
              </Text>
              <Text style={stockStyles.muted}>
                Delivers in about {s.leadTimeDays} day{s.leadTimeDays === 1 ? '' : 's'} · {theirs.length} product{theirs.length === 1 ? '' : 's'}
                {theirs.length > 0 ? `: ${theirs.slice(0, 3).map((p) => p.name).join(', ')}${theirs.length > 3 ? '…' : ''}` : ''}
              </Text>
              {s.notes ? <Text style={styles.notes}>{s.notes}</Text> : null}
              <View style={styles.buttons}>
                <View style={styles.flex}>
                  <Button
                    fill
                    label="Order"
                    icon={StockIcons.cart}
                    onPress={() => router.push({ pathname: '/retail/order/[id]', params: { id: 'new', supplier: s.id } } as Href)}
                  />
                </View>
                <View style={styles.flex}>
                  <Button fill label="Edit" variant="secondary" icon={StockIcons.edit} onPress={() => setDraft({ ...s })} />
                </View>
              </View>
              <View style={styles.links}>
                {s.phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${s.phone.replace(/[^0-9+]/g, '')}`)} accessibilityRole="link" hitSlop={6}>
                    <Text style={styles.link}>Call</Text>
                  </Pressable>
                ) : null}
                {s.email ? (
                  <Pressable onPress={() => Linking.openURL(`mailto:${s.email}`)} accessibilityRole="link" hitSlop={6}>
                    <Text style={styles.link}>Email</Text>
                  </Pressable>
                ) : null}
                {s.website ? (
                  <Pressable onPress={() => Linking.openURL(/^https?:\/\//.test(s.website) ? s.website : `https://${s.website}`)} accessibilityRole="link" hitSlop={6}>
                    <Text style={styles.link}>Website</Text>
                  </Pressable>
                ) : null}
                <View style={styles.flex} />
                <Pressable onPress={() => setDeleting(s)} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
              </View>
            </Panel>
          );
        })
      )}

      <ConfirmDialog
        visible={!!deleting}
        message={`Delete ${deleting?.name ?? 'this supplier'}? Their products stay, with no supplier. Past orders keep their details.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          const s = deleting;
          setDeleting(null);
          if (!s) return;
          const error = await deleteSupplier(s.id);
          setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: `${s.name} deleted.` });
        }}
        onCancel={() => setDeleting(null)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  formTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  name: { color: C.text, fontSize: 17, fontWeight: '700' },
  notes: { color: C.text, fontSize: 14, lineHeight: 20 },
  links: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  link: { color: C.accent, fontSize: 15, fontWeight: '600' },
  delete: { color: C.danger, fontSize: 14, fontWeight: '600' },
});
