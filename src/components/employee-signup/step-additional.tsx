import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SelectField } from '@/components/employee/form-fields';
import { formatTfn, SUPER_FUNDS, type EmployeeStepProps, type PickedDocument } from '@/components/employee-signup/types';
import { useNativePicker } from '@/components/pickers/use-native-picker';
import { Button, Field, fieldStyles, Icon, Input, SignupColors as C } from '@/components/signup/fields';
import { formatShortDate } from '@/data/employee-roster';
import { MAX_DOCUMENT_BYTES, QUALIFICATION_TYPES } from '@/data/qualifications';
import { newId } from '@/lib/ids';

const SUGGESTED_QUALIFICATIONS = QUALIFICATION_TYPES.filter((q) => q !== 'Other');

const PICKER_THEME = {
  sheet: '#FFFFFF',
  border: C.border,
  text: C.text,
  muted: C.textSecondary,
  accent: C.primary,
  dark: false,
};

export function StepAdditional({ data, update, onNext, nextLabel }: EmployeeStepProps) {
  const [tried, setTried] = useState(false);
  const [showTfnInfo, setShowTfnInfo] = useState(false);

  const tfnDigits = data.tfn.replace(/\D/g, '');
  const errors = {
    tfn: tfnDigits.length > 0 && tfnDigits.length !== 9 && 'A tax file number has 9 digits.',
    superOther: data.superFund === 'Other' && !data.superFundOther.trim() && 'Enter your super fund name.',
    emergencyName: !data.emergencyName.trim() && 'Enter an emergency contact name.',
    emergencyPhone: data.emergencyPhone.replace(/\D/g, '').length < 8 && 'Enter a valid emergency contact phone.',
  };

  return (
    <>
      <Field label="Tax file number" optional error={tried && errors.tfn}>
        <View style={styles.tfnRow}>
          <View style={fieldStyles.flex}>
            <Input
              value={data.tfn}
              onChangeText={(t) => update({ tfn: formatTfn(t) })}
              placeholder="123 456 789"
              keyboardType="number-pad"
              autoComplete="off"
              password
              accessibilityLabel="Tax file number"
              icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
              hasError={tried && !!errors.tfn}
            />
          </View>
          <Pressable
            onPress={() => setShowTfnInfo((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel="What is my TFN used for?"
            hitSlop={8}
            style={styles.info}>
            <Icon name={{ ios: 'info.circle', android: 'info', web: 'info' }} color={C.primary} size={20} />
          </Pressable>
        </View>
        {showTfnInfo && (
          <Text style={styles.infoText}>
            Your TFN is used by your employer for payroll, so the right amount of tax is withheld from your pay. It&apos;s
            stored encrypted, shown masked, and only your employer can see it. If you don&apos;t provide it, tax may be
            withheld at the highest rate.
          </Text>
        )}
      </Field>

      <Field label="Superannuation fund" optional>
        <SelectField
          title="Superannuation fund"
          value={data.superFund as (typeof SUPER_FUNDS)[number] | null}
          options={SUPER_FUNDS}
          placeholder="Select your super fund"
          onChange={(superFund) => update({ superFund })}
        />
        {data.superFund === 'Other' && (
          <Input
            value={data.superFundOther}
            onChangeText={(superFundOther) => update({ superFundOther })}
            placeholder="Your super fund's name"
            autoCapitalize="words"
            accessibilityLabel="Super fund name"
            hasError={tried && !!errors.superOther}
          />
        )}
        {tried && errors.superOther ? <Text style={styles.errorText}>{errors.superOther}</Text> : null}
      </Field>

      <Field label="Emergency contact name" error={tried && errors.emergencyName}>
        <Input
          value={data.emergencyName}
          onChangeText={(emergencyName) => update({ emergencyName })}
          placeholder="e.g. Sam Smith"
          autoCapitalize="words"
          accessibilityLabel="Emergency contact name"
          icon={{ ios: 'person.2', android: 'group', web: 'group' }}
          hasError={tried && !!errors.emergencyName}
        />
      </Field>
      <Field label="Emergency contact phone" error={tried && errors.emergencyPhone}>
        <Input
          value={data.emergencyPhone}
          onChangeText={(t) => update({ emergencyPhone: t.replace(/[^\d+ ]/g, '') })}
          placeholder="04xx xxx xxx"
          keyboardType="phone-pad"
          accessibilityLabel="Emergency contact phone"
          icon={{ ios: 'phone', android: 'call', web: 'call' }}
          hasError={tried && !!errors.emergencyPhone}
        />
      </Field>

      <QualificationsField data={data} update={update} />

      <Button
        label={nextLabel}
        arrow
        onPress={() => {
          setTried(true);
          if (!Object.values(errors).some(Boolean)) onNext();
        }}
      />
    </>
  );
}

/** Licences, tickets and certificates: name, expiry date and an optional photo/PDF. */
function QualificationsField({ data, update }: Pick<EmployeeStepProps, 'data' | 'update'>) {
  const [name, setName] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [file, setFile] = useState<PickedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expiryPicker = useNativePicker({
    mode: 'date',
    value: expiryDate ?? new Date(),
    onChange: setExpiryDate,
    title: 'Expiry date',
    theme: PICKER_THEME,
  });

  async function pickFile() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > MAX_DOCUMENT_BYTES) {
      setError('That file is larger than 10MB. Please choose a smaller one.');
      return;
    }
    setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? '', size: asset.size ?? 0 });
  }

  function add() {
    if (!name.trim()) {
      setError('Enter the name of the qualification, e.g. White Card.');
      return;
    }
    update({ qualifications: [...data.qualifications, { id: newId(), name: name.trim(), expiryDate, file }] });
    setName('');
    setExpiryDate(null);
    setFile(null);
    setError(null);
  }

  return (
    <Field label="Qualifications, licences & tickets" optional error={error ?? undefined}>
      {data.qualifications.length > 0 && (
        <View style={fieldStyles.card}>
          {data.qualifications.map((q, i) => (
            <View key={q.id} style={[styles.docRow, i > 0 && styles.divider]}>
              <View style={styles.docIcon}>
                <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} color={C.done} size={18} />
              </View>
              <View style={fieldStyles.flex}>
                <Text style={styles.docKind}>{q.name}</Text>
                <Text style={styles.docName} numberOfLines={1}>
                  {[q.expiryDate ? `Expires ${formatShortDate(q.expiryDate)}` : 'No expiry', q.file?.name].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Pressable
                onPress={() => update({ qualifications: data.qualifications.filter((x) => x.id !== q.id) })}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${q.name}`}
                hitSlop={8}>
                <Icon name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} color={C.muted} size={20} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={fieldStyles.card}>
        <View style={styles.chips}>
          {SUGGESTED_QUALIFICATIONS.slice(0, 6).map((q) => (
            <Pressable
              key={q}
              onPress={() => setName(q)}
              accessibilityRole="button"
              style={[styles.chip, name === q && styles.chipSelected]}>
              <Text style={[styles.chipText, name === q && styles.chipTextSelected]}>{q}</Text>
            </Pressable>
          ))}
        </View>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Qualification name, e.g. Forklift Licence"
          autoCapitalize="words"
          accessibilityLabel="Qualification name"
        />
        <View style={styles.dateBox}>
          <Pressable onPress={expiryPicker.open} accessibilityRole="button" accessibilityLabel="Expiry date" style={styles.dateButton}>
            <Icon name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} color={C.muted} size={16} />
            <Text style={[styles.dateText, !expiryDate && styles.placeholder]}>
              {expiryDate ? `Expires ${formatShortDate(expiryDate)}` : 'Expiry date (leave blank if none)'}
            </Text>
          </Pressable>
          {expiryDate && (
            <Pressable onPress={() => setExpiryDate(null)} accessibilityRole="button" accessibilityLabel="Clear expiry date" hitSlop={8}>
              <Icon name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} color={C.muted} size={18} />
            </Pressable>
          )}
        </View>
        {expiryPicker.element}
        <View style={styles.docRow}>
          <Text style={[styles.docName, fieldStyles.flex]} numberOfLines={1}>
            {file ? file.name : 'Photo or PDF (optional, up to 10MB)'}
          </Text>
          {file ? (
            <Pressable onPress={() => setFile(null)} accessibilityRole="button" accessibilityLabel="Remove file" hitSlop={8}>
              <Icon name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} color={C.muted} size={20} />
            </Pressable>
          ) : (
            <Pressable
              onPress={pickFile}
              accessibilityRole="button"
              accessibilityLabel="Attach a photo or PDF"
              style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}>
              <Text style={styles.uploadText}>Attach file</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={add} accessibilityRole="button" style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color="#FFFFFF" size={16} />
          <Text style={styles.addText}>Add qualification</Text>
        </Pressable>
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  chipText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: C.primary,
  },
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
  },
  dateText: {
    flex: 1,
    color: C.text,
    fontSize: 16,
  },
  placeholder: {
    color: C.muted,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.primary,
  },
  addText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  tfnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  info: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primarySoft,
  },
  infoText: {
    color: C.text,
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.primarySoft,
  },
  errorText: {
    color: C.danger,
    fontSize: 13,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  docIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  docKind: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  docName: {
    color: C.textSecondary,
    fontSize: 13,
  },
  uploadButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.primary,
  },
  uploadText: {
    color: C.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
