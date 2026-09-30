import { useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { suggestRoles } from '@/components/employee-signup/roles';
import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { EmploymentFields, parsePayRate, sendInvite, type EmploymentDraft } from '@/components/owner/employee-ui';
import { FormField, TextField } from '@/components/owner/form';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Button, Card, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { createInvite, deleteInvite, updateInvite, useInvites } from '@/data/employee-invites';
import { toDateKey } from '@/data/shifts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Add someone to the team before they've signed up. They show as "Invited"
// until they sign up with the business code; their profile then gets the role
// and pay entered here. Opened with ?id=... to edit an existing invite.
export default function AddEmployeeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useInvites().find((i) => i.id === id) ?? null;
  const business = useBusiness();

  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [draft, setDraft] = useState<EmploymentDraft>({
    role: existing?.role ?? '',
    payRate: existing?.payRate != null ? String(existing.payRate) : '',
    payType: existing?.payType ?? 'hourly',
    employmentType: existing?.employmentType ?? '',
    startDate: existing?.startDate ?? toDateKey(new Date()),
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/employees' as Href));
  const editing = !!id;

  if (editing && !existing) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Invited Employee" onBack={back} />
        <Card>
          <Text style={styles.muted}>This invite couldn&apos;t be found. They may have already signed up.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  const pay = parsePayRate(draft.payRate, draft.payType);
  const errors = {
    fullName: !fullName.trim() ? 'Enter their full name.' : undefined,
    email: email.trim() && !EMAIL_PATTERN.test(email.trim()) ? 'Enter a valid email address.' : undefined,
    phone: phone.trim() && phone.replace(/\D/g, '').length < 8 ? 'Enter a valid phone number.' : undefined,
    contact: !email.trim() && !phone.trim() ? 'Add an email or phone number so you can send them the invite.' : undefined,
    pay: 'error' in pay ? pay.error : undefined,
  };

  async function save() {
    setTried(true);
    if (Object.values(errors).some(Boolean) || 'error' in pay || busy) return;
    setBusy(true);
    setError(null);
    const values = {
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role: draft.role.trim(),
      employmentType: draft.employmentType,
      payType: draft.payType,
      payRate: pay.rate,
      startDate: draft.startDate,
    };
    try {
      if (existing) {
        await updateInvite(existing.id, values);
        back();
      } else {
        const saved = await createInvite(values);
        back();
        // Straight into sending the invite (email / text / share).
        sendInvite(saved);
      }
    } catch (e) {
      setError(`Couldn’t save. ${e instanceof Error && e.message.includes('business') ? e.message : 'Check your internet connection and try again.'}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setConfirmDelete(false);
    try {
      await deleteInvite(existing.id);
      back();
    } catch {
      setError('Couldn’t cancel the invite. Check your internet connection and try again.');
    }
  }

  return (
    <OwnerScreen>
      <ScreenHeader title={editing ? 'Invited Employee' : 'Add Employee'} onBack={back} />

      <Card title="Personal Information" icon={OwnerIcons.people}>
        <FormField label="Full name" error={tried ? errors.fullName : undefined}>
          <TextField value={fullName} onChangeText={setFullName} placeholder="e.g. Josh Carter" autoCapitalize="words" accessibilityLabel="Full name" />
        </FormField>
        <FormField label="Email" error={tried ? errors.email : undefined}>
          <TextField
            value={email}
            onChangeText={setEmail}
            placeholder="josh@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email"
          />
        </FormField>
        <FormField label="Phone" error={tried ? (errors.phone ?? errors.contact) : undefined}>
          <TextField
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^\d+ ]/g, ''))}
            placeholder="0412 345 678"
            keyboardType="phone-pad"
            accessibilityLabel="Phone"
          />
        </FormField>
      </Card>

      <Card title="Employment Details" icon={OwnerIcons.money}>
        <EmploymentFields
          draft={draft}
          onChange={(changes) => setDraft((d) => ({ ...d, ...changes }))}
          roleSuggestions={suggestRoles(business?.industry ?? null, business?.industryCategory ?? null)}
        />
      </Card>

      <Card>
        <Text style={styles.muted}>
          They&apos;ll show as “Invited” until they sign up using your business code. When they sign up with this email
          or phone number (or the invite link you send), their profile is linked automatically with the role and pay
          you&apos;ve set here, and the details they enter (bank, tax, emergency contact, qualifications).
        </Text>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.buttons}>
        <Button
          label={busy ? 'Saving…' : editing ? 'Save Changes' : 'Add & Send Invite'}
          icon={editing ? OwnerIcons.check : { ios: 'paperplane.fill', android: 'send', web: 'send' }}
          disabled={busy}
          onPress={save}
        />
        {existing && (
          <>
            <Button
              label="Send Invite"
              icon={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
              variant="secondary"
              onPress={() => sendInvite(existing)}
            />
            <Button label="Cancel Invite" variant="secondary" onPress={() => setConfirmDelete(true)} />
          </>
        )}
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        message={`Cancel ${existing?.fullName ?? 'this person'}'s invite? They'll be removed from your Employees list. (If they still sign up with your business code, they'll join as a new employee.)`}
        confirmLabel="Cancel Invite"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: C.danger,
    fontSize: 14,
  },
  buttons: {
    gap: Spacing.two,
  },
});
