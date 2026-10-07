import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { comingSoon } from '@/components/auth/auth-screen';
import { Button, Field, fieldStyles, Icon, Input, Note, SignupColors as C } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';
import { EMAIL_APPS } from '@/data/business';
import { formatBsb } from '@/components/employee-signup/types';
import { emailAppHint } from '@/lib/email';

const ACCOUNTING = ['QuickBooks', 'Xero', 'MYOB', 'Other'];

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function StepConnect({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);
  const bsbDigits = data.bankBsb.replace(/\D/g, '');
  const errors = {
    businessEmail: !isEmail(data.businessEmail) && 'Enter the email address you send quotes and invoices from.',
    bsb: bsbDigits.length > 0 && bsbDigits.length !== 6 && 'A BSB has 6 digits.',
  };

  return (
    <>
      <Text style={styles.sectionTitle}>Sending quotes & invoices</Text>
      <View style={fieldStyles.card}>
        <Text style={styles.cardText}>
          Quotes, invoices and receipts open in your own email app, written and with the PDF attached. You just press
          Send.
        </Text>
        <Field label="Which email app do you use?" hint={emailAppHint(data.emailApp)}>
          <View style={styles.choices} accessibilityRole="radiogroup">
            {EMAIL_APPS.map((app) => {
              const selected = data.emailApp === app.value;
              return (
                <Pressable
                  key={app.value}
                  onPress={() => update({ emailApp: app.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{app.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
        <Field label="Business email address" error={tried && errors.businessEmail}>
          <Input
            value={data.businessEmail}
            onChangeText={(businessEmail) => update({ businessEmail })}
            placeholder="e.g. hello@smithcarpentry.com.au"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Business email address"
            icon={{ ios: 'envelope', android: 'mail', web: 'mail' }}
            hasError={tried && !!errors.businessEmail}
          />
        </Field>
      </View>

      <Text style={styles.sectionTitle}>
        Bank details for invoices <Text style={styles.optional}>(optional)</Text>
      </Text>
      <View style={fieldStyles.card}>
        <Text style={styles.cardText}>Printed on your invoices so customers can pay you by bank transfer.</Text>
        <Field label="Account name">
          <Input
            value={data.bankAccountName}
            onChangeText={(bankAccountName) => update({ bankAccountName })}
            placeholder="e.g. Smith Carpentry Pty Ltd"
            autoCapitalize="words"
            accessibilityLabel="Account name"
          />
        </Field>
        <View style={fieldStyles.row}>
          <View style={fieldStyles.flex}>
            <Field label="BSB" error={tried && errors.bsb}>
              <Input
                value={data.bankBsb}
                onChangeText={(bankBsb) => update({ bankBsb: formatBsb(bankBsb) })}
                placeholder="000-000"
                keyboardType="number-pad"
                accessibilityLabel="BSB"
                hasError={tried && !!errors.bsb}
              />
            </Field>
          </View>
          <View style={fieldStyles.flex}>
            <Field label="Account number">
              <Input
                value={data.bankAccountNumber}
                onChangeText={(bankAccountNumber) => update({ bankAccountNumber: bankAccountNumber.replace(/[^\d\s-]/g, '') })}
                placeholder="12345678"
                keyboardType="number-pad"
                accessibilityLabel="Account number"
              />
            </Field>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        Bank connection <Text style={styles.optional}>(optional)</Text>
      </Text>
      <View style={fieldStyles.card}>
        <View style={styles.headerRow}>
          <View style={styles.bigIcon}>
            <Icon name={{ ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' }} color={C.primary} size={22} />
          </View>
          <View style={fieldStyles.flex}>
            <Text style={styles.cardTitle}>Connect your business bank account</Text>
            <Text style={styles.cardText}>See payments and transactions in NexGain automatically.</Text>
          </View>
        </View>
        <NotConnected />
        <Button
          label="Connect Bank Account"
          icon={{ ios: 'link', android: 'link', web: 'link' }}
          onPress={() => {
            // TODO(bank): open a secure bank connection here (e.g. an open banking /
            // CDR provider). Never ask for or store bank login details in the app.
            comingSoon('Bank connection');
          }}
        />
      </View>

      <Text style={styles.sectionTitle}>
        Accounting software <Text style={styles.optional}>(optional)</Text>
      </Text>
      <View style={fieldStyles.card}>
        {ACCOUNTING.map((name, i) => (
          <View key={name} style={[styles.accountRow, i > 0 && styles.divider]}>
            <View style={styles.smallIcon}>
              <Icon name={{ ios: 'chart.bar.doc.horizontal', android: 'description', web: 'description' }} color={C.textSecondary} size={16} />
            </View>
            <View style={fieldStyles.flex}>
              <Text style={styles.accountName}>{name}</Text>
              <Text style={styles.status}>Not connected</Text>
            </View>
            <Pressable
              onPress={() => {
                // TODO(accounting): start the provider's sign-in (OAuth) flow here for
                // QuickBooks / Xero / MYOB. Tokens must be stored on a server, not the phone.
                comingSoon(`${name} connection`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Connect ${name}`}
              style={({ pressed }) => [styles.connect, pressed && styles.pressed]}>
              <Text style={styles.connectText}>Connect</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Note>You can change your email and bank details later in Business Profile, and connect apps from Integrations.</Note>
      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (!errors.businessEmail && !errors.bsb) onNext();
        }}
      />
    </>
  );
}

function NotConnected() {
  return (
    <View style={styles.badge}>
      <View style={styles.dot} />
      <Text style={styles.badgeText}>Not connected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bigIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primarySoft,
  },
  cardTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardText: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.muted,
  },
  badgeText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
  optional: {
    color: C.muted,
    fontWeight: '400',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  smallIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  accountName: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  status: {
    color: C.muted,
    fontSize: 12,
  },
  connect: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.primary,
  },
  connectText: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  choices: {
    flexDirection: 'row',
    gap: 8,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  choiceSelected: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  choiceText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: C.primary,
  },
});
