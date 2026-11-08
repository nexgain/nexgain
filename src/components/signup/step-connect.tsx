import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { comingSoon } from '@/components/auth/auth-screen';
import { ConnectApps } from '@/components/owner/connect-apps';
import { Button, Field, fieldStyles, Icon, Input, Note, SignupColors as C } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';
import { toggleChosen } from '@/data/business-apps';
import { formatBsb } from '@/components/employee-signup/types';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function StepConnect({
  data,
  update,
  onNext,
  ensureAccount,
}: StepProps & {
  /** Creates the account and business (if not done yet) so an email account can be connected to it. */
  ensureAccount: () => Promise<boolean>;
}) {
  const [tried, setTried] = useState(false);
  const bsbDigits = data.bankBsb.replace(/\D/g, '');
  const errors = {
    businessEmail: !isEmail(data.businessEmail) && 'Enter the email address you send quotes and invoices from.',
    bsb: bsbDigits.length > 0 && bsbDigits.length !== 6 && 'A BSB has 6 digits.',
  };

  return (
    <>
      <Text style={styles.cardText}>
        Connect Gmail or Outlook to send quotes, invoices and receipts straight from your own email address, with the
        PDF attached. Or choose Mail or Other to have them open in your phone&apos;s email app, ready to send.
      </Text>
      <ConnectApps
        theme="light"
        emailApp={data.emailApp}
        onEmailAppChange={(emailApp) => update({ emailApp })}
        beforeConnect={async () => {
          // Connecting needs the account, so it's created now (instead of on Next).
          setTried(true);
          if (errors.businessEmail || errors.bsb) return false;
          return ensureAccount();
        }}
        emailFooter={
          <View style={fieldStyles.card}>
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
        }
        optionalNote="Everything below is optional. You can add these later in More › Integrations."
        apps={data.apps}
        onToggleApp={(app) => update({ apps: toggleChosen(data.apps, app, (a) => a) })}
      />

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

      <Note>You can change your email and bank details later in Business Profile, and connect apps from More › Integrations.</Note>
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
});
