import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, TextField } from '@/components/owner/form';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Badge, Button, Card, goBack, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { availabilityFor, useAvailability, WEEKDAY_NAMES } from '@/data/availability';
import { format12h, formatShortDate } from '@/data/employee-roster';
import {
  documentLink,
  employeeFullName,
  loadEmployeeDocuments,
  revealPrivateDetails,
  updateEmployee,
  useEmployees,
  type EmployeeDocument,
} from '@/data/employees';
import { formatMoney, maskAccountNumber } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

type PrivateDetails = Awaited<ReturnType<typeof revealPrivateDetails>>;

// One employee's profile, opened by tapping their name on the Roster.
export default function EmployeeProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const employee = useEmployees().find((e) => e.id === id) ?? null;
  const week = availabilityFor(useAvailability(), id ?? null);

  const [documents, setDocuments] = useState<EmployeeDocument[] | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [rateText, setRateText] = useState<string | null>(null);
  const [rateMessage, setRateMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<PrivateDetails | 'loading' | 'error' | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadEmployeeDocuments(id)
      .then((docs) => !cancelled && setDocuments(docs))
      .catch(() => !cancelled && setDocuments([]));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const back = () => goBack('/roster');

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

  const rateValue = rateText ?? (employee.payRate === null ? '' : employee.payRate.toFixed(2));
  const parsedRate = Number(rateValue.replace(/[$,\s]/g, ''));
  const rateInvalid = rateValue.trim() !== '' && (!Number.isFinite(parsedRate) || parsedRate <= 0 || parsedRate > 1000);

  async function saveRate() {
    if (rateInvalid || !employee) return;
    const payRate = rateValue.trim() === '' ? null : Math.round(parsedRate * 100) / 100;
    setRateMessage('Saving…');
    const ok = await updateEmployee(employee.id, { payRate });
    setRateText(null);
    setRateMessage(ok ? 'Pay rate saved.' : 'Couldn’t save. Check your internet connection and try again.');
  }

  async function showDetails() {
    if (!employee) return;
    setDetails('loading');
    try {
      setDetails(await revealPrivateDetails(employee.id));
    } catch {
      setDetails('error');
    }
  }

  async function openDocument(doc: EmployeeDocument) {
    setDocumentError(null);
    try {
      await Linking.openURL(await documentLink(doc.storagePath));
    } catch {
      setDocumentError(`Couldn’t open ${doc.kind}. Please try again.`);
    }
  }

  const dob = employee.dateOfBirth ? formatShortDate(fromDateKey(employee.dateOfBirth)) : '—';

  return (
    <OwnerScreen>
      <ScreenHeader title="Employee Profile" onBack={back} />

      <Card>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {employee.firstName[0]}
              {employee.lastName[0]}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{employeeFullName(employee)}</Text>
            <Text style={styles.muted}>
              {[employee.role || 'No position set', employee.employmentType].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.muted}>Employee ID: {employee.employeeId}</Text>
          </View>
        </View>
      </Card>

      <Card title="Contact" icon={OwnerIcons.people}>
        <Rows
          rows={[
            ['Phone', employee.phone || '—'],
            ['Email', employee.email],
            ['Address', employee.address || '—'],
            ['Date of birth', dob],
            ['Emergency contact', [employee.emergencyContactName, employee.emergencyContactPhone].filter(Boolean).join(' · ') || '—'],
          ]}
        />
      </Card>

      <Card title="Employment & Pay" icon={OwnerIcons.money}>
        <Rows
          rows={[
            ['Position', employee.role || '—'],
            ['Employment type', employee.employmentType || '—'],
            ['Super fund', employee.superFund || '—'],
            ['Current pay rate', employee.payRate === null ? 'Not set' : `${formatMoney(employee.payRate)}/hr`],
          ]}
        />
        <FormField label="Hourly pay rate ($)" error={rateInvalid ? 'Enter an hourly rate, e.g. 32.50' : undefined}>
          <View style={styles.rateRow}>
            <TextField
              value={rateValue}
              onChangeText={(t) => {
                setRateText(t);
                setRateMessage(null);
              }}
              placeholder="e.g. 32.50"
              keyboardType="decimal-pad"
              accessibilityLabel="Hourly pay rate"
              style={styles.flex}
            />
            <Button label="Save" disabled={rateInvalid || rateText === null} onPress={saveRate} />
          </View>
        </FormField>
        {rateMessage ? <Text style={styles.muted}>{rateMessage}</Text> : null}
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
            <Text style={styles.muted}>Only you can see full bank and tax details. They&apos;re hidden again when you leave.</Text>
          </>
        )}
      </Card>

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

      <Card title="Documents" icon={OwnerIcons.receipt}>
        {documents === null ? (
          <ActivityIndicator color={C.accent} />
        ) : documents.length === 0 ? (
          <Text style={styles.muted}>No documents uploaded.</Text>
        ) : (
          documents.map((doc, i) => (
            <Pressable
              key={doc.id}
              onPress={() => openDocument(doc)}
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
        {documentError ? <Text style={styles.error}>{documentError}</Text> : null}
      </Card>
    </OwnerScreen>
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
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  name: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
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
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  link: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
