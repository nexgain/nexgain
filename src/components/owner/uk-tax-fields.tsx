// United Kingdom businesses ONLY: an employee's PAYE tax code and "Scottish
// taxpayer" switch, shown on the employee's page instead of Australia's
// tax-free threshold question. Never shown for any other country.
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { FormField, TextField } from '@/components/owner/form';
import { Colors as C, Spacing } from '@/constants/theme';
import { updateEmployee, type Employee } from '@/data/employees';
import { parseTaxCode, TAPER_NOTE } from '@/data/uk/payroll';

export function UkTaxFields({ employee }: { employee: Employee }) {
  const saved = employee.ukTaxCode ?? '1257L';
  const [text, setText] = useState<string | null>(null);
  const value = text ?? saved;
  const check = parseTaxCode(value);

  function save() {
    const code = value.trim().toUpperCase();
    setText(null);
    if (!code || code === saved) return;
    updateEmployee(employee.id, { ukTaxCode: code });
  }

  return (
    <>
      <FormField label="Tax code" error={!check.ok ? check.message : undefined}>
        <TextField
          value={value}
          onChangeText={setText}
          onBlur={save}
          onSubmitEditing={save}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="1257L"
          maxLength={12}
          accessibilityLabel="Tax code"
        />
      </FormField>
      <Text style={styles.muted}>
        From the employee’s P45, starter checklist or HMRC. Most people are on 1257L. Supported: L codes, BR, D0, D1, 0T and NT, and the
        emergency W1/M1 versions (e.g. 1257L M1). {TAPER_NOTE}
      </Text>

      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.label}>Scottish taxpayer</Text>
          <Text style={styles.muted}>Their tax code starts with S. Scottish income tax isn’t supported yet, so their pay run is blocked until it is.</Text>
        </View>
        <Switch
          value={employee.scottishTaxpayer}
          onValueChange={(on) => {
            updateEmployee(employee.id, { scottishTaxpayer: on });
          }}
          trackColor={{ true: C.accent, false: C.inputBorder }}
          thumbColor={C.onAccent}
          ios_backgroundColor={C.inputBorder}
          accessibilityLabel="Scottish taxpayer"
        />
      </View>
      {employee.scottishTaxpayer && <Text style={styles.warning}>NexGain can’t pay this employee yet: Scottish income tax isn’t supported.</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  warning: { color: C.warning, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.two },
});
