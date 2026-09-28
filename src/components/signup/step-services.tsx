import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Checkbox, Field, Icon, SignupColors as C } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';
import { categoryIcon, findIndustry, GENERAL_SERVICES } from '@/data/industries';

/** Adds or removes a service, ignoring letter case and extra spaces. */
export function toggleService(list: string[], service: string) {
  const name = service.trim();
  const exists = list.some((s) => s.toLowerCase() === name.toLowerCase());
  return exists ? list.filter((s) => s.toLowerCase() !== name.toLowerCase()) : [...list, name];
}

export function StepServices({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState('');

  const industry = data.industry?.category ? findIndustry(data.industry.name) : null;
  const recommended = industry?.services ?? GENERAL_SERVICES;
  const icon = categoryIcon(industry?.category ?? null);
  const isSelected = (s: string) => data.services.some((x) => x.toLowerCase() === s.toLowerCase());

  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    if (!isSelected(name)) update({ services: [...data.services, name] });
    setCustom('');
  }

  return (
    <>
      <Text style={styles.sectionLabel}>
        {industry ? `Recommended for ${industry.name}` : 'Suggested services'}
      </Text>
      <View style={styles.grid}>
        {recommended.map((service) => {
          const checked = isSelected(service);
          return (
            <Pressable
              key={service}
              onPress={() => update({ services: toggleService(data.services, service) })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={service}
              style={({ pressed }) => [styles.tile, checked && styles.tileSelected, pressed && styles.pressed]}>
              <View style={styles.tileTop}>
                <View style={[styles.tileIcon, checked && styles.tileIconSelected]}>
                  <Icon name={icon} color={checked ? '#FFFFFF' : C.primary} size={15} />
                </View>
                <Checkbox checked={checked} />
              </View>
              <Text style={styles.tileText}>{service}</Text>
            </Pressable>
          );
        })}
      </View>

      {!showCustom ? (
        <Button
          label="Add Custom Service"
          variant="secondary"
          icon={{ ios: 'plus', android: 'add', web: 'add' }}
          onPress={() => setShowCustom(true)}
        />
      ) : (
        <Field label="Add another service">
          <View style={styles.addRow}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              onSubmitEditing={addCustom}
              placeholder="e.g. Emergency call-outs"
              placeholderTextColor={C.muted}
              returnKeyType="done"
              autoFocus
              accessibilityLabel="Add another service"
              style={styles.addInput}
            />
            <Pressable
              onPress={addCustom}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <Text style={styles.addButtonText}>Add Service</Text>
            </Pressable>
          </View>
        </Field>
      )}

      <Field
        label={`Your selected services (${data.services.length})`}
        error={tried && data.services.length === 0 && 'Select at least one service to continue.'}>
        {data.services.length === 0 ? (
          <Text style={styles.empty}>No services selected yet.</Text>
        ) : (
          <View style={styles.chips}>
            {data.services.map((service) => (
              <View key={service} style={styles.chip}>
                <Text style={styles.chipText}>{service}</Text>
                <Pressable
                  onPress={() => update({ services: toggleService(data.services, service) })}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${service}`}
                  hitSlop={8}>
                  <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color="#FFFFFF" size={11} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Field>

      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (data.services.length > 0) onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  sectionLabel: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: '#FFFFFF',
  },
  tileSelected: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primarySoft,
  },
  tileIconSelected: {
    backgroundColor: C.primary,
  },
  tileText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
    color: C.text,
    fontSize: 15,
  },
  addButton: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: C.primary,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  empty: {
    color: C.muted,
    fontSize: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: C.primary,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
