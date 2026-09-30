import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { suggestRoles } from '@/components/employee-signup/roles';
import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import {
  Avatar,
  EmploymentFields,
  OptionalDateField,
  parsePayRate,
  SelectBox,
  StatusBadge,
  type EmploymentDraft,
} from '@/components/owner/employee-ui';
import { FormField, TextField } from '@/components/owner/form';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Badge, Button, Card, Icon, OwnerIcons, OwnerScreen, TabRow, type IconName } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { availabilityFor, useAvailability, WEEKDAY_NAMES } from '@/data/availability';
import { useBusiness } from '@/data/business';
import { format12h, formatShortDate } from '@/data/employee-roster';
import {
  documentLink,
  EMPLOYEE_STATUS_LABEL,
  employeeFullName,
  formatPayRate,
  loadEmployeeDocuments,
  loadPayRateHistory,
  PAY_TYPE_LABEL,
  revealPrivateDetails,
  setEmployeePhoto,
  updateEmployee,
  useEmployees,
  type Employee,
  type EmployeeDocument,
  type EmployeeStatus,
  type PayRateChange,
} from '@/data/employees';
import { formatMoney, maskAccountNumber, usePayslipRecords } from '@/data/payroll';
import {
  addQualification,
  deleteQualification,
  getQualificationStatus,
  loadQualifications,
  MAX_DOCUMENT_BYTES,
  QUALIFICATION_TYPES,
  useQualifications,
  type Qualification,
  type QualificationDocument,
} from '@/data/qualifications';
import { fromDateKey } from '@/data/shifts';
import { supabase } from '@/lib/supabase';

const TABS = ['Details', 'Pay & Payroll', 'Qualifications', 'Documents', 'Availability', 'Job Notes'] as const;
type Tab = (typeof TABS)[number];

const STATUSES: readonly EmployeeStatus[] = ['active', 'on_leave', 'inactive'];

const dateText = (key: string | null) => (key ? formatShortDate(fromDateKey(key)) : '—');

// One employee's profile, opened from the Employees list or the Roster.
export default function EmployeeProfileScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const employee = useEmployees().find((e) => e.id === id) ?? null;
  const [tab, setTab] = useState<Tab>('Details');
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  const back = () => router.navigate(from === 'employees' ? ('/employees' as Href) : '/roster');

  if (!employee) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Employee" onBack={back} />
        <Card>
          <Text style={styles.muted}>This employee couldn&apos;t be found.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  async function changePhoto() {
    if (!employee) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled) return;
    setPhotoMessage('Uploading photo…');
    const ok = await setEmployeePhoto(employee, { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
    setPhotoMessage(ok ? null : 'Couldn’t save the photo. Check your internet connection and try again.');
  }

  const name = employeeFullName(employee);
  const contactButtons = [
    employee.phone && { label: 'Call', icon: { ios: 'phone.fill', android: 'call', web: 'call' }, url: `tel:${employee.phone.replace(/[^\d+]/g, '')}` },
    employee.phone && { label: 'Text', icon: { ios: 'message.fill', android: 'sms', web: 'sms' }, url: `sms:${employee.phone.replace(/[^\d+]/g, '')}` },
    employee.email && { label: 'Email', icon: { ios: 'envelope.fill', android: 'mail', web: 'mail' }, url: `mailto:${employee.email}` },
  ].filter(Boolean) as { label: string; icon: IconName; url: string }[];

  return (
    <OwnerScreen>
      <ScreenHeader title="Employee Profile" onBack={back} />

      <Card>
        <View style={styles.header}>
          <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel="Change profile photo">
            <Avatar name={name} photoUrl={employee.photoUrl} size={72} />
            <View style={styles.cameraBadge}>
              <Icon name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} color="#FFFFFF" size={12} />
            </View>
          </Pressable>
          <View style={styles.flex}>
            <View style={styles.nameLine}>
              <Text style={styles.name}>{name}</Text>
              <StatusBadge status={employee.status} />
            </View>
            <Text style={styles.role}>{employee.role || 'No role set'}</Text>
            <Text style={styles.muted} selectable>
              {employee.email}
            </Text>
            {employee.phone ? (
              <Text style={styles.muted} selectable>
                {employee.phone}
              </Text>
            ) : null}
            <Text style={styles.muted}>Started {dateText(employee.startDate)}</Text>
          </View>
        </View>
        {photoMessage ? <Text style={styles.muted}>{photoMessage}</Text> : null}
        {contactButtons.length > 0 && (
          <View style={styles.contactRow}>
            {contactButtons.map((b) => (
              <Pressable
                key={b.label}
                onPress={() => Linking.openURL(b.url).catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel={`${b.label} ${name}`}
                style={({ pressed }) => [styles.contactButton, pressed && styles.pressed]}>
                <Icon name={b.icon} color={C.accent} size={14} />
                <Text style={styles.contactText}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      <TabRow tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'Details' && <DetailsTab employee={employee} />}
      {tab === 'Pay & Payroll' && <PayTab employee={employee} />}
      {tab === 'Qualifications' && <QualificationsTab employee={employee} />}
      {tab === 'Documents' && <DocumentsTab employee={employee} />}
      {tab === 'Availability' && <AvailabilityTab employee={employee} />}
      {tab === 'Job Notes' && <JobNotesTab employee={employee} />}
    </OwnerScreen>
  );
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

function DetailsTab({ employee }: { employee: Employee }) {
  return (
    <>
      <Card title="Personal Information" icon={OwnerIcons.people}>
        <Rows
          rows={[
            ['Full name', employeeFullName(employee)],
            ['Email', employee.email],
            ['Phone', employee.phone || '—'],
            ['Address', employee.address || '—'],
            ['Date of birth', dateText(employee.dateOfBirth)],
            ['Emergency contact', [employee.emergencyContactName, employee.emergencyContactPhone].filter(Boolean).join(' · ') || '—'],
            ['Super fund', employee.superFund || '—'],
            ['Employee ID', employee.employeeId],
          ]}
        />
      </Card>
      <EmploymentCard key={employee.id} employee={employee} />
    </>
  );
}

function toDraft(e: Employee): EmploymentDraft & { status: EmployeeStatus } {
  return {
    role: e.role,
    payRate: e.payRate === null ? '' : e.payType === 'salary' ? String(e.payRate) : e.payRate.toFixed(2),
    payType: e.payType,
    employmentType: e.employmentType,
    startDate: e.startDate,
    status: e.status,
  };
}

/** Role, pay, employment type, start date and status. Payroll uses these straight away. */
function EmploymentCard({ employee }: { employee: Employee }) {
  const business = useBusiness();
  const [draft, setDraft] = useState(() => toDraft(employee));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saved = toDraft(employee);
  const changed = (Object.keys(saved) as (keyof typeof saved)[]).some((k) => draft[k] !== saved[k]);
  const pay = parsePayRate(draft.payRate, draft.payType);

  async function save() {
    if ('error' in pay || saving) return;
    setSaving(true);
    setMessage('Saving…');
    const ok = await updateEmployee(employee.id, {
      role: draft.role.trim(),
      payRate: pay.rate,
      payType: draft.payType,
      employmentType: draft.employmentType,
      startDate: draft.startDate,
      status: draft.status,
    });
    setSaving(false);
    if (ok) {
      setDraft(toDraft({ ...employee, role: draft.role.trim(), payRate: pay.rate, payType: draft.payType, employmentType: draft.employmentType, startDate: draft.startDate, status: draft.status }));
    }
    setMessage(ok ? 'Changes saved. Payroll will use the new pay rate from now on.' : 'Couldn’t save. Check your internet connection and try again.');
  }

  return (
    <Card title="Employment Details" icon={OwnerIcons.money}>
      <EmploymentFields
        draft={draft}
        onChange={(changes) => {
          setDraft((d) => ({ ...d, ...changes }));
          setMessage(null);
        }}
        roleSuggestions={suggestRoles(business?.industry ?? null, business?.industryCategory ?? null)}
      />
      <FormField label="Status">
        <SelectBox
          label="Status"
          value={draft.status}
          options={STATUSES}
          display={(s) => EMPLOYEE_STATUS_LABEL[s]}
          onChange={(status) => {
            setDraft((d) => ({ ...d, status }));
            setMessage(null);
          }}
        />
      </FormField>
      <Button label={saving ? 'Saving…' : 'Save Changes'} icon={OwnerIcons.check} disabled={!changed || saving || 'error' in pay} onPress={save} />
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pay & Payroll
// ---------------------------------------------------------------------------

type PrivateDetails = Awaited<ReturnType<typeof revealPrivateDetails>>;

function PayTab({ employee }: { employee: Employee }) {
  const payslips = usePayslipRecords().filter((p) => p.employeeId === employee.id);
  const [history, setHistory] = useState<PayRateChange[] | 'error' | null>(null);
  const [details, setDetails] = useState<PrivateDetails | 'loading' | 'error' | null>(null);

  // Reloads whenever the rate changes (e.g. just saved on the Details tab).
  useEffect(() => {
    let cancelled = false;
    loadPayRateHistory(employee.id)
      .then((h) => !cancelled && setHistory(h))
      .catch(() => !cancelled && setHistory('error'));
    return () => {
      cancelled = true;
    };
  }, [employee.id, employee.payRate, employee.payType]);

  async function showDetails() {
    setDetails('loading');
    try {
      setDetails(await revealPrivateDetails(employee.id));
    } catch {
      setDetails('error');
    }
  }

  return (
    <>
      <Card title="Current Pay" icon={OwnerIcons.money}>
        <Rows
          rows={[
            ['Pay rate', formatPayRate(employee.payRate, employee.payType)],
            ['Pay type', PAY_TYPE_LABEL[employee.payType]],
            ['Employment type', employee.employmentType || '—'],
          ]}
        />
        <Text style={styles.muted}>
          Payroll always uses this rate. Change it on the Details tab. Payments already approved keep the rate they
          were paid at.
        </Text>
      </Card>

      <Card title="Pay Rate History" icon={OwnerIcons.trendingUp}>
        {history === null ? (
          <ActivityIndicator color={C.accent} />
        ) : history === 'error' ? (
          <Text style={styles.muted}>Couldn&apos;t load the pay history.</Text>
        ) : history.length === 0 ? (
          <Text style={styles.muted}>No pay rate changes yet.</Text>
        ) : (
          history.map((h, i) => (
            <View key={h.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.rowValueLeft}>
                  {h.oldRate === null ? 'Set to ' : `${formatPayRate(h.oldRate, h.oldPayType)} → `}
                  {formatPayRate(h.newRate, h.newPayType)}
                </Text>
                <Text style={styles.muted}>{formatShortDate(new Date(h.changedAt))}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <Card title="Recent Payments" icon={OwnerIcons.wallet}>
        {payslips.length === 0 ? (
          <Text style={styles.muted}>No payments approved yet.</Text>
        ) : (
          payslips.slice(0, 6).map((p, i) => (
            <View key={p.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.rowValueLeft}>
                  {formatShortDate(fromDateKey(p.periodStart), false)} – {formatShortDate(fromDateKey(p.periodEnd))}
                </Text>
                <Text style={styles.muted}>
                  {p.hours} hrs · gross {formatMoney(p.gross)}
                </Text>
              </View>
              <Text style={styles.rowValue}>{formatMoney(p.net)}</Text>
            </View>
          ))
        )}
      </Card>

      <Card title="Bank & Tax (Payroll)" icon={OwnerIcons.bank}>
        {details && details !== 'loading' && details !== 'error' ? (
          <>
            <Rows
              rows={[
                ['Account name', details.account_name || '—'],
                ['BSB', details.bsb || '—'],
                ['Account number', details.account_number || '—'],
                ['Tax file number', details.tfn || 'Not provided'],
              ]}
            />
            <Button label="Hide Details" variant="secondary" onPress={() => setDetails(null)} />
          </>
        ) : (
          <>
            <Rows
              rows={[
                ['Bank account', employee.bankAccount ? maskAccountNumber(employee.bankAccount.accountNumber) : 'Not added'],
                ['Tax file number', employee.hasTfn ? '*** *** ***' : 'Not provided'],
              ]}
            />
            {details === 'error' && <Text style={styles.error}>Couldn&apos;t load the details. Please try again.</Text>}
            {details === 'loading' ? (
              <ActivityIndicator color={C.accent} />
            ) : (
              <Button label="Show Full Details for Payroll" variant="secondary" onPress={showDetails} />
            )}
            <Text style={styles.muted}>
              Only you and {employee.firstName} can see full bank and tax details. They&apos;re hidden again when you leave.
            </Text>
          </>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Qualifications
// ---------------------------------------------------------------------------

function QualificationsTab({ employee }: { employee: Employee }) {
  const qualifications = useQualifications(employee.id);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Qualification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQualifications(employee.id)
      .then(() => setLoadError(false))
      .catch(() => setLoadError(true));
  }, [employee.id]);

  async function remove() {
    const q = removing;
    setRemoving(null);
    if (!q) return;
    try {
      await deleteQualification(q);
    } catch {
      setError('Couldn’t remove it. Check your internet connection and try again.');
    }
  }

  return (
    <>
      <Card
        title="Qualifications & Licences"
        icon={OwnerIcons.check}
        right={
          !adding ? (
            <Pressable onPress={() => setAdding(true)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.link}>+ Add</Text>
            </Pressable>
          ) : null
        }>
        {qualifications === null ? (
          loadError ? (
            <Text style={styles.error}>Couldn&apos;t load qualifications. Check your internet connection.</Text>
          ) : (
            <ActivityIndicator color={C.accent} />
          )
        ) : qualifications.length === 0 ? (
          <Text style={styles.muted}>No qualifications added yet. {employee.firstName} can add them too, from their app.</Text>
        ) : (
          qualifications.map((q, i) => <QualificationRow key={q.id} qualification={q} first={i === 0} onRemove={() => setRemoving(q)} />)
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      {adding && <AddQualificationCard employee={employee} onDone={() => setAdding(false)} />}

      <ConfirmDialog
        visible={!!removing}
        message={`Remove ${removing?.name ?? 'this qualification'} from ${employee.firstName}'s profile?`}
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

const QUAL_TONE = { valid: 'success', expiring: 'warning', expired: 'danger' } as const;

function QualificationRow({ qualification, first, onRemove }: { qualification: Qualification; first: boolean; onRemove: () => void }) {
  const status = getQualificationStatus(qualification.expiryDate);
  const doc = qualification.document;
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <Pressable
        onPress={() => doc?.uri && Linking.openURL(doc.uri)}
        disabled={!doc?.uri}
        accessibilityRole="button"
        accessibilityLabel={doc ? `Open ${qualification.name} file` : qualification.name}
        style={styles.thumb}>
        {doc?.kind === 'image' && doc.uri ? (
          <Image source={{ uri: doc.uri }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Icon
            name={doc ? { ios: 'doc.richtext.fill', android: 'picture_as_pdf', web: 'picture_as_pdf' } : { ios: 'rosette', android: 'workspace_premium', web: 'workspace_premium' }}
            color={C.textSecondary}
            size={20}
          />
        )}
      </Pressable>
      <View style={styles.flex}>
        <Text style={styles.rowValueLeft}>{qualification.name}</Text>
        <Text style={styles.muted}>
          {qualification.expiryDate ? `Expires ${formatShortDate(qualification.expiryDate)}` : 'No expiry date'}
        </Text>
        <Badge label={status.label} tone={QUAL_TONE[status.tone]} />
      </View>
      <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${qualification.name}`} hitSlop={8}>
        <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.textSecondary} size={16} />
      </Pressable>
    </View>
  );
}

const QUAL_SUGGESTIONS = QUALIFICATION_TYPES.filter((q) => q !== 'Other');

function AddQualificationCard({ employee, onDone }: { employee: Employee; onDone: () => void }) {
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState<string | null>(null);
  const [file, setFile] = useState<Omit<QualificationDocument, 'kind'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function accept(picked: Omit<QualificationDocument, 'kind'>) {
    if (picked.size > MAX_DOCUMENT_BYTES) {
      setError('That file is larger than 10MB. Please choose a smaller one.');
      return;
    }
    setError(null);
    setFile(picked);
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const a = result.assets[0];
    accept({ uri: a.uri, name: a.fileName ?? 'photo.jpg', mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? 0 });
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const a = result.assets[0];
    accept({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? '', size: a.size ?? 0 });
  }

  function chooseUpload() {
    if (Platform.OS === 'web') {
      pickFile();
      return;
    }
    Alert.alert('Attach a file', undefined, [
      { text: 'Choose Photo', onPress: pickPhoto },
      { text: 'Choose File (PDF)', onPress: pickFile },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function save() {
    if (!name.trim()) {
      setError('Enter the name of the qualification.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addQualification(employee, { name, issueDate: null, expiryDate: expiry ? fromDateKey(expiry) : null, document: file });
      onDone();
    } catch {
      setError('Couldn’t save. Check your internet connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Add Qualification" icon={OwnerIcons.check}>
      <FormField label="Name">
        <TextField value={name} onChangeText={setName} placeholder="e.g. White Card" autoCapitalize="words" accessibilityLabel="Qualification name" />
        <View style={styles.chips}>
          {QUAL_SUGGESTIONS.slice(0, 6).map((q) => (
            <Pressable key={q} onPress={() => setName(q)} accessibilityRole="button" style={[styles.chip, name === q && styles.chipSelected]}>
              <Text style={[styles.chipText, name === q && styles.chipTextSelected]}>{q}</Text>
            </Pressable>
          ))}
        </View>
      </FormField>
      <FormField label="Expiry date">
        <OptionalDateField label="Expiry date" value={expiry} onChange={setExpiry} placeholder="Leave blank if it doesn't expire" />
      </FormField>
      <FormField label="Photo or file (optional)">
        {file ? (
          <View style={styles.row}>
            <Text style={[styles.rowValueLeft, styles.flex]} numberOfLines={1}>
              {file.name}
            </Text>
            <Pressable onPress={() => setFile(null)} accessibilityRole="button" accessibilityLabel="Remove file" hitSlop={8}>
              <Icon name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} color={C.textSecondary} size={18} />
            </Pressable>
          </View>
        ) : (
          <Button label="Attach Photo or PDF" icon={{ ios: 'paperclip', android: 'attach_file', web: 'attach_file' }} variant="secondary" onPress={chooseUpload} />
        )}
      </FormField>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttonRow}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={onDone} disabled={saving} />
        </View>
        <View style={styles.flex}>
          <Button label={saving ? 'Saving…' : 'Save'} icon={OwnerIcons.check} onPress={save} disabled={saving} />
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Documents, Availability, Job Notes
// ---------------------------------------------------------------------------

function DocumentsTab({ employee }: { employee: Employee }) {
  const [documents, setDocuments] = useState<EmployeeDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadEmployeeDocuments(employee.id)
      .then((docs) => !cancelled && setDocuments(docs))
      .catch(() => !cancelled && setDocuments([]));
    return () => {
      cancelled = true;
    };
  }, [employee.id]);

  async function open(doc: EmployeeDocument) {
    setError(null);
    try {
      await Linking.openURL(await documentLink(doc.storagePath));
    } catch {
      setError(`Couldn’t open ${doc.kind}. Please try again.`);
    }
  }

  return (
    <Card title="Documents" icon={OwnerIcons.receipt}>
      {documents === null ? (
        <ActivityIndicator color={C.accent} />
      ) : documents.length === 0 ? (
        <Text style={styles.muted}>No documents uploaded. Licence and ticket files are on the Qualifications tab.</Text>
      ) : (
        documents.map((doc, i) => (
          <Pressable
            key={doc.id}
            onPress={() => open(doc)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${doc.kind}`}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
            <View style={styles.flex}>
              <Text style={styles.rowValueLeft}>{doc.kind}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {doc.fileName}
              </Text>
            </View>
            <Text style={styles.link}>Open</Text>
            <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
          </Pressable>
        ))
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

function AvailabilityTab({ employee }: { employee: Employee }) {
  const week = availabilityFor(useAvailability(), employee.id);
  return (
    <Card title="Availability" icon={OwnerIcons.calendar}>
      {week ? (
        WEEKDAY_NAMES.map((day, i) => (
          <View key={day} style={[styles.row, i > 0 && styles.divider]}>
            <Text style={styles.rowLabel}>{day}</Text>
            {week[i].available ? (
              <Text style={styles.rowValue}>
                {format12h(week[i].start)} – {format12h(week[i].end)}
              </Text>
            ) : (
              <Badge label="Unavailable" tone="neutral" />
            )}
          </View>
        ))
      ) : (
        <Text style={styles.muted}>{employee.firstName} hasn&apos;t set their availability yet.</Text>
      )}
    </Card>
  );
}

type JobNote = {
  id: string;
  shift_date: string | null;
  job_title: string | null;
  location: string | null;
  outcome: string;
  notes: string;
  issues: string;
  submitted_at: string;
};

const OUTCOME_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  'Went well': 'success',
  'Minor issues': 'warning',
  "Didn't go well": 'danger',
};

function JobNotesTab({ employee }: { employee: Employee }) {
  const [notes, setNotes] = useState<JobNote[] | 'error' | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('job_reports')
      .select('id, shift_date, job_title, location, outcome, notes, issues, submitted_at')
      .eq('employee_id', employee.id)
      .order('submitted_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!cancelled) setNotes(error ? 'error' : (data as JobNote[]));
      });
    return () => {
      cancelled = true;
    };
  }, [employee.id]);

  return (
    <Card title="Job Notes" icon={OwnerIcons.receipt}>
      {notes === null ? (
        <ActivityIndicator color={C.accent} />
      ) : notes === 'error' ? (
        <Text style={styles.muted}>Couldn&apos;t load job notes.</Text>
      ) : notes.length === 0 ? (
        <Text style={styles.muted}>{employee.firstName} hasn&apos;t submitted any job reports yet.</Text>
      ) : (
        notes.map((n, i) => (
          <View key={n.id} style={[styles.note, i > 0 && styles.divider]}>
            <View style={styles.nameLine}>
              <Text style={[styles.rowValueLeft, styles.flex]}>{n.job_title || 'Job report'}</Text>
              <Badge label={n.outcome} tone={OUTCOME_TONE[n.outcome] ?? 'neutral'} />
            </View>
            <Text style={styles.muted}>
              {[n.shift_date ? dateText(n.shift_date) : formatShortDate(new Date(n.submitted_at)), n.location].filter(Boolean).join(' · ')}
            </Text>
            {n.notes.trim() ? <Text style={styles.noteText}>{n.notes.trim()}</Text> : null}
            {n.issues.trim() ? <Text style={[styles.noteText, styles.issues]}>Issues: {n.issues.trim()}</Text> : null}
          </View>
        ))
      )}
    </Card>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([label, value], i) => (
        <View key={label} style={[styles.row, i > 0 && styles.divider]}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue} selectable>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: C.surface,
  },
  nameLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
  },
  role: {
    color: C.text,
    fontSize: 14,
    marginBottom: 2,
  },
  contactRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
  },
  contactText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  rowLabel: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 14,
  },
  rowValue: {
    flexShrink: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  rowValueLeft: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  link: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium - 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceRaised,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.three - 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipSelected: {
    borderColor: C.accent,
    backgroundColor: 'rgba(79, 140, 255, 0.14)',
  },
  chipText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: C.accent,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  note: {
    gap: 4,
    paddingVertical: Spacing.two + 2,
  },
  noteText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  issues: {
    color: C.warning,
  },
});
