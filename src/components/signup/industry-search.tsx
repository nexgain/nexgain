import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Input, SignupColors as C } from '@/components/signup/fields';
import type { SelectedIndustry } from '@/components/signup/types';
import { categoryIcon, searchIndustries } from '@/data/industries';

/**
 * Smart search box for the business industry: suggestions appear underneath as
 * you type; tapping one fills the box. Anything else can be kept as a custom industry.
 */
export function IndustrySearch({
  text,
  selected,
  onChangeText,
  onSelect,
  hasError,
}: {
  text: string;
  selected: SelectedIndustry | null;
  onChangeText: (text: string) => void;
  onSelect: (industry: SelectedIndustry) => void;
  hasError?: boolean;
}) {
  const query = text.trim();
  const showSuggestions = query.length > 0 && !(selected && selected.name === text);
  const matches = showSuggestions ? searchIndustries(query) : [];
  const exact = matches.some((m) => m.name.toLowerCase() === query.toLowerCase());

  return (
    <View style={styles.wrap}>
      <Input
        value={text}
        onChangeText={onChangeText}
        placeholder="Start typing, e.g. carpentry, dog grooming..."
        autoCorrect={false}
        accessibilityLabel="Business industry"
        icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        hasError={hasError}
      />

      {selected && selected.name === text && (
        <View style={styles.selected}>
          <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} color={C.done} size={14} />
          <Text style={styles.selectedText}>
            {selected.category ? `${selected.name} – ${selected.category}` : `${selected.name} (custom industry)`}
          </Text>
        </View>
      )}

      {showSuggestions && (
        <View style={styles.list}>
          {matches.map((industry, i) => (
            <Pressable
              key={industry.id}
              onPress={() => onSelect({ name: industry.name, category: industry.category })}
              accessibilityRole="button"
              accessibilityLabel={`${industry.name}, ${industry.category}`}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.icon}>
                <Icon name={categoryIcon(industry.category)} color={C.primary} size={16} />
              </View>
              <View style={styles.text}>
                <Text style={styles.name}>{industry.name}</Text>
                <Text style={styles.category}>{industry.category}</Text>
              </View>
            </Pressable>
          ))}
          {!exact && (
            <Pressable
              onPress={() => onSelect({ name: query, category: null })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, matches.length > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={[styles.icon, styles.customIcon]}>
                <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color={C.textSecondary} size={16} />
              </View>
              <View style={styles.text}>
                <Text style={styles.name}>Use &quot;{query}&quot; as my industry</Text>
                {matches.length === 0 && <Text style={styles.category}>No matching industries found</Text>}
              </View>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedText: {
    color: C.done,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    boxShadow: '0px 6px 16px rgba(15, 23, 42, 0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    backgroundColor: C.primarySoft,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primarySoft,
  },
  customIcon: {
    backgroundColor: '#F1F5F9',
  },
  text: {
    flex: 1,
    gap: 1,
  },
  name: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  category: {
    color: C.muted,
    fontSize: 13,
  },
});
