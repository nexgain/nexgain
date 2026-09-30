import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { updateBusiness, useBusiness } from '@/data/business';

/** Edit the business's services (chosen at sign-up); used as job types on quotes and invoices. */
export default function ServicesScreen() {
  const business = useBusiness();
  const [text, setText] = useState('');
  const services = business?.services ?? [];

  function add() {
    const name = text.trim();
    if (!name || services.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setText('');
      return;
    }
    updateBusiness({ services: [...services, name] });
    setText('');
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Services" />
      <Text style={styles.subtitle}>The services you offer. They appear as job types when you create quotes and invoices.</Text>

      {!business ? (
        <Card>
          <EmptyState icon={OwnerIcons.receipt} message="Complete owner sign-up to set up your services." />
        </Card>
      ) : (
        <>
          <Card title={`Your services (${services.length})`}>
            {services.length === 0 ? (
              <Text style={styles.muted}>No services yet. Add one below.</Text>
            ) : (
              <View style={styles.chips}>
                {services.map((s) => (
                  <View key={s} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                    <Pressable
                      onPress={() => updateBusiness({ services: services.filter((x) => x !== s) })}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${s}`}
                      hitSlop={8}>
                      <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color="#FFFFFF" size={11} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card title="Add a service">
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={add}
              placeholder="e.g. Emergency call-outs"
              placeholderTextColor={C.textSecondary}
              returnKeyType="done"
              accessibilityLabel="New service"
              style={styles.input}
            />
            <Button label="Add Service" icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={add} />
          </Card>
        </>
      )}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    minHeight: 48,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
    color: C.text,
    fontSize: 15,
  },
});
