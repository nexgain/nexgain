import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/employee/date-field';
import { FormField, SelectField } from '@/components/employee/form-fields';
import { Card, Icon } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import {
  addQualification,
  formatFileSize,
  MAX_DOCUMENT_BYTES,
  QUALIFICATION_TYPES,
  type QualificationDocument,
} from '@/data/qualifications';

type QualificationType = (typeof QUALIFICATION_TYPES)[number];

type PickedFile = { uri: string; name: string; mimeType: string; size: number };

function toDocument(file: PickedFile): QualificationDocument | string {
  const name = file.name.toLowerCase();
  const isPdf = file.mimeType === 'application/pdf' || name.endsWith('.pdf');
  const isImage = file.mimeType.startsWith('image/') || /\.(jpe?g|png)$/.test(name);
  if (!isPdf && !isImage) return 'Please choose a JPG, PNG or PDF file.';
  if (file.size > MAX_DOCUMENT_BYTES) return 'That file is larger than 10MB.';
  return { ...file, kind: isPdf ? 'pdf' : 'image' };
}

export default function AddQualificationScreen() {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<QualificationType | null>(null);
  const [otherName, setOtherName] = useState('');
  const [issueDate, setIssueDate] = useState<Date | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [document, setDocument] = useState<QualificationDocument | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const typeError = !type ? 'Choose a qualification type.' : undefined;
  const otherError =
    type === 'Other' && !otherName.trim() ? 'Enter the name of the qualification.' : undefined;
  const dateError =
    issueDate && expiryDate && expiryDate < issueDate
      ? 'Expiry date must be after the issue date.'
      : undefined;

  function acceptFile(file: PickedFile) {
    const result = toDocument(file);
    if (typeof result === 'string') {
      setUploadError(result);
    } else {
      setUploadError(null);
      setDocument(result);
    }
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    acceptFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? '',
      size: asset.size ?? 0,
    });
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    acceptFile({
      uri: asset.uri,
      name: asset.fileName ?? 'photo.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? 0,
    });
  }

  function chooseUpload() {
    // The browser's file dialog covers both photos and PDFs, so skip the choice on web.
    if (Platform.OS === 'web') {
      pickFile();
      return;
    }
    Alert.alert('Upload document', undefined, [
      { text: 'Choose Photo', onPress: pickPhoto },
      { text: 'Choose File (PDF)', onPress: pickFile },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function save() {
    setSubmitted(true);
    if (typeError || otherError || dateError || !type) return;
    addQualification({
      name: type === 'Other' ? otherName.trim() : type,
      issueDate,
      expiryDate,
      document,
    });
    router.back();
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FormField label="Qualification Type" error={submitted ? typeError : undefined}>
          <SelectField
            title="Qualification Type"
            value={type}
            options={QUALIFICATION_TYPES}
            placeholder="Select a qualification"
            onChange={setType}
            hasError={submitted && !!typeError}
          />
        </FormField>

        {type === 'Other' && (
          <FormField label="Qualification Name" error={submitted ? otherError : undefined}>
            <TextInput
              value={otherName}
              onChangeText={setOtherName}
              placeholder="e.g. Barista Certificate"
              placeholderTextColor={C.textMuted}
              style={[styles.input, submitted && otherError && styles.inputError]}
              autoCapitalize="words"
            />
          </FormField>
        )}

        <FormField label="Issue Date">
          <DateField
            label="Issue Date"
            value={issueDate}
            onChange={setIssueDate}
            maximumDate={new Date()}
            clearable
          />
        </FormField>

        <FormField label="Expiry Date" error={dateError}>
          <DateField
            label="Expiry Date"
            value={expiryDate}
            onChange={setExpiryDate}
            placeholder="Select date (leave blank if it doesn't expire)"
            minimumDate={issueDate ?? undefined}
            clearable
            hasError={!!dateError}
          />
        </FormField>

        <FormField label="Upload Document" error={uploadError ?? undefined}>
          {document ? (
            <Card style={styles.preview}>
              <View style={styles.previewThumb}>
                {document.kind === 'image' ? (
                  <Image source={{ uri: document.uri }} style={styles.previewImage} contentFit="cover" />
                ) : (
                  <Icon
                    name={{ ios: 'doc.richtext.fill', android: 'picture_as_pdf', web: 'picture_as_pdf' }}
                    color={C.danger}
                    size={26}
                  />
                )}
              </View>
              <View style={styles.previewText}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {document.name}
                </Text>
                <Text style={styles.previewMeta}>
                  {document.kind === 'pdf' ? 'PDF' : 'Image'}
                  {document.size ? ` · ${formatFileSize(document.size)}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => setDocument(null)}
                accessibilityRole="button"
                accessibilityLabel="Remove document"
                hitSlop={8}
                style={styles.removeButton}>
                <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color="#FFFFFF" size={12} />
              </Pressable>
            </Card>
          ) : (
            <Pressable
              onPress={chooseUpload}
              accessibilityRole="button"
              accessibilityLabel="Upload document"
              style={({ pressed }) => [styles.uploadBox, pressed && styles.pressed]}>
              <View style={styles.uploadIcon}>
                <Icon
                  name={{ ios: 'icloud.and.arrow.up', android: 'cloud_upload', web: 'cloud_upload' }}
                  color={C.primary}
                  size={22}
                />
              </View>
              <Text style={styles.uploadTitle}>Tap to upload a photo or PDF</Text>
              <Text style={styles.uploadHint}>JPG, PNG or PDF (Max 10MB)</Text>
            </Pressable>
          )}
        </FormField>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={save}
          accessibilityRole="button"
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
          <Text style={styles.saveButtonText}>Save Qualification</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: Spacing.four - 4,
    gap: Spacing.four - 4,
  },
  pressed: {
    opacity: 0.7,
  },
  input: {
    minHeight: 50,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    color: C.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: C.danger,
  },
  uploadBox: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.large - 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B9CCF5',
    backgroundColor: C.primarySoft,
  },
  uploadIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  uploadTitle: {
    color: C.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  uploadHint: {
    color: C.textSecondary,
    fontSize: 13,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
  },
  previewThumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.medium,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewText: {
    flex: 1,
    gap: 2,
  },
  previewName: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  previewMeta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.three,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  saveButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    backgroundColor: C.primary,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
