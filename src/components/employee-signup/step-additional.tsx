import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SelectField } from '@/components/employee/form-fields';
import {
  DOCUMENT_KINDS,
  formatTfn,
  SUPER_FUNDS,
  type DocumentKind,
  type EmployeeStepProps,
} from '@/components/employee-signup/types';
import { Button, Field, fieldStyles, Icon, Input, SignupColors as C } from '@/components/signup/fields';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function StepAdditional({ data, update, onNext, nextLabel }: EmployeeStepProps) {
  const [tried, setTried] = useState(false);
  const [showTfnInfo, setShowTfnInfo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const tfnDigits = data.tfn.replace(/\D/g, '');
  const errors = {
    tfn: tfnDigits.length > 0 && tfnDigits.length !== 9 && 'A tax file number has 9 digits.',
    superOther: data.superFund === 'Other' && !data.superFundOther.trim() && 'Enter your super fund name.',
    emergencyName: !data.emergencyName.trim() && 'Enter an emergency contact name.',
    emergencyPhone: data.emergencyPhone.replace(/\D/g, '').length < 8 && 'Enter a valid emergency contact phone.',
  };

  async function pick(kind: DocumentKind) {
    setUploadError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > MAX_FILE_BYTES) {
      setUploadError('That file is larger than 10MB. Please choose a smaller one.');
      return;
    }
    update({
      documents: {
        ...data.documents,
        [kind]: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? '', size: asset.size ?? 0 },
      },
    });
  }

  function remove(kind: DocumentKind) {
    const next = { ...data.documents };
    delete next[kind];
    update({ documents: next });
  }

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

      <Field label="Upload documents" optional error={uploadError ?? undefined} hint="Photos or PDFs, up to 10MB each.">
        <View style={fieldStyles.card}>
          {DOCUMENT_KINDS.map((kind, i) => {
            const doc = data.documents[kind];
            return (
              <View key={kind} style={[styles.docRow, i > 0 && styles.divider]}>
                <View style={styles.docIcon}>
                  <Icon
                    name={doc ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } : { ios: 'doc.fill', android: 'description', web: 'description' }}
                    color={doc ? C.done : C.textSecondary}
                    size={18}
                  />
                </View>
                <View style={fieldStyles.flex}>
                  <Text style={styles.docKind}>{kind}</Text>
                  <Text style={styles.docName} numberOfLines={1}>
                    {doc ? doc.name : 'Not uploaded'}
                  </Text>
                </View>
                {doc ? (
                  <Pressable onPress={() => remove(kind)} accessibilityRole="button" accessibilityLabel={`Remove ${kind}`} hitSlop={8}>
                    <Icon name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} color={C.muted} size={20} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => pick(kind)}
                    accessibilityRole="button"
                    accessibilityLabel={`Upload ${kind}`}
                    style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}>
                    <Text style={styles.uploadText}>Upload file</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </Field>

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

const styles = StyleSheet.create({
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
