import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button, Card, EmptyState, Icon, OwnerScreen, PageHeader, TabRow } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { router } from '@/lib/nav';
import { MenuIcons, MenuItemRow } from '@/systems/hospitality/components/owner/menu-ui';
import { setItemActive, useHospitalityLoaded, useMenuCategories, useMenuItems, type MenuItem } from '@/systems/hospitality/data/menu';
import { dateKey, isSpecialNow } from '@/systems/hospitality/data/sales-stats';

const ALL = 'All';
const SPECIALS = 'Specials';
const NO_CATEGORY = 'No category';

// The Menu tab: every item by category, searchable. Specials running today
// are shown first. The switch on each item hides it (86'd or seasonal).
export default function MenuScreen() {
  const loaded = useHospitalityLoaded();
  const categories = [...useMenuCategories()].sort((a, b) => a.sort - b.sort);
  const items = useMenuItems();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(ALL);
  const [error, setError] = useState<string | null>(null);
  const today = dateKey(new Date());

  const q = query.trim().toLowerCase();
  const matches = (i: MenuItem) => !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
  const specials = items.filter((i) => isSpecialNow(i, today) && matches(i));
  const uncategorised = items.filter((i) => !i.categoryId || !categories.some((c) => c.id === i.categoryId));

  const sections = [
    ...categories.map((c) => ({ id: c.id, name: c.name, items: items.filter((i) => i.categoryId === c.id) })),
    ...(uncategorised.length ? [{ id: 'none', name: NO_CATEGORY, items: uncategorised }] : []),
  ].map((s) => ({ ...s, items: s.items.filter(matches).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)) }));

  const tabs = [ALL, ...(specials.length ? [SPECIALS] : []), ...sections.map((s) => s.name)];
  const active = tabs.includes(tab) ? tab : ALL;
  const shown = active === ALL ? sections : sections.filter((s) => s.name === active);

  async function toggle(item: MenuItem, on: boolean) {
    setError(null);
    try {
      await setItemActive(item.id, on);
    } catch (e) {
      setError(`Couldn’t update ${item.name}: ${e instanceof Error ? e.message : 'please try again.'}`);
    }
  }

  const open = (item: MenuItem) => router.push({ pathname: '/hospitality/menu-item/[id]', params: { id: item.id } });
  const row = (item: MenuItem, i: number) => (
    <MenuItemRow
      key={item.id}
      item={item}
      showDivider={i > 0}
      special={isSpecialNow(item, today)}
      onPress={() => open(item)}
      right={
        <Switch
          value={item.active}
          onValueChange={(on) => toggle(item, on)}
          trackColor={{ true: C.accent, false: C.inputBorder }}
          thumbColor={C.onAccent}
          ios_backgroundColor={C.inputBorder}
          accessibilityLabel={`${item.name} on sale`}
        />
      }
    />
  );

  return (
    <OwnerScreen>
      <PageHeader
        title="Menu"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'} in ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}. The switch hides an item (86’d or out of season).`}
        right={
          <Pressable
            onPress={() => router.push({ pathname: '/hospitality/menu-item/[id]', params: { id: 'new' } })}
            accessibilityRole="button"
            accessibilityLabel="Add a menu item"
            hitSlop={8}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Icon name={MenuIcons.plus} color={C.onAccent} size={18} />
          </Pressable>
        }
      />

      <View style={styles.search}>
        <Icon name={MenuIcons.search} color={C.textSecondary} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search the menu"
          placeholderTextColor={C.textMuted}
          accessibilityLabel="Search the menu"
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>

      {tabs.length > 1 && <TabRow tabs={tabs} active={active} onChange={setTab} />}

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      {!loaded ? (
        <ActivityIndicator color={C.accent} style={styles.loading} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={MenuIcons.menu} message="Your menu is empty. Add your first item: its name, price and (if you like) what it costs to make." />
          <Button label="Add an item" icon={MenuIcons.plus} onPress={() => router.push({ pathname: '/hospitality/menu-item/[id]', params: { id: 'new' } })} />
          <Button label="Edit categories" variant="secondary" onPress={() => router.push('/hospitality/menu-categories')} />
        </Card>
      ) : (
        <>
          {(active === ALL || active === SPECIALS) && specials.length > 0 && (
            <Card title="Specials today" icon={MenuIcons.star}>
              <View>{specials.map(row)}</View>
            </Card>
          )}
          {active !== SPECIALS &&
            shown.map((s) =>
              s.items.length === 0 && q ? null : (
                <Card key={s.id} title={s.name}>
                  {s.items.length ? (
                    <View>{s.items.map(row)}</View>
                  ) : (
                    <Text style={styles.muted}>Nothing in this category yet. Tap + to add an item.</Text>
                  )}
                </Card>
              ),
            )}
          {q && specials.length === 0 && shown.every((s) => s.items.length === 0) && (
            <Card>
              <EmptyState icon={MenuIcons.search} message={`Nothing on the menu matches “${query.trim()}”.`} />
            </Card>
          )}
          <Button label="Edit categories" icon={MenuIcons.category} variant="secondary" onPress={() => router.push('/hospitality/menu-categories')} />
        </>
      )}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  loading: { marginTop: Spacing.five },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: Spacing.two },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
});
