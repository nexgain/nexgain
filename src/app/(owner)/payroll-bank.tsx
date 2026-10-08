import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { FieldButton, FormField, OptionSheet, TextField } from '@/components/owner/form';
import { ScreenHeader, Segmented } from '@/components/owner/invoices-ui';
import { Button, Card, OwnerIcons, OwnerScreen, ownerStyles } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { updateBusiness, useBusiness } from '@/data/business';
import { loadPayrollBank, savePayrollBank } from '@/data/pay-runs';
import {
  COUNTRIES,
  countryName,
  EMPTY_PAYER,
  formatBsb,
  formatIban,
  formatSortCode,
  PAYMENT_FILE_LABEL,
  payerFieldsFor,
  paymentFileTypeFor,
  validatePayer,
  type PayerField,
  type PayerSettings,
} from '@/lib/payment-files';

const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

// Payroll bank setup: the account wages are paid from and the IDs the bank
// gave the owner. Only asks what the bank file for their country needs.
// Opened from Payroll (Settings, or when a payment file can't be made yet).
export default function PayrollBankScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const business = useBusiness();
  const country = business?.country ?? null;
  const fileType = paymentFileTypeFor(country);
  const [payer, setPayer] = useState<PayerSettings | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [tried, setTried] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'load-error'>('idle');

  useEffect(() => {
    let live = true;
    loadPayrollBank()
      .then((p) => live && setPayer(p))
      .catch(() => live && (setPayer({ ...EMPTY_PAYER }), setStatus('load-error')));
    return () => {
      live = false;
    };
  }, []);

  const back = () => (from === 'payroll' ? router.navigate('/payroll') : router.back());
  const errors = fileType && payer ? validatePayer(fileType, payer) : {};
  const set = (key: PayerField, text: string) => {
    setStatus('idle');
    setPayer((p) => (p ? { ...p, [key]: format(key, text) } : p));
  };

  /** Tidies numbers as they're typed (BSB 062-000, sort code 12-34-56, IBAN in groups of 4). */
  function format(key: PayerField, text: string) {
    if (key === 'bankCode') {
      if (fileType === 'aba') return formatBsb(text);
      if (fileType === 'bacs18') return formatSortCode(text);
      return text.replace(/\D/g, '').slice(0, 9);
    }
    if (key === 'accountNumber') return text.replace(/\D/g, '').slice(0, fileType === 'bacs18' ? 8 : 9);
    if (key === 'iban') return formatIban(text);
    if (key === 'bic' || key === 'bankShortName' || key === 'companyId') return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (key === 'userIdNumber') return text.replace(/\D/g, '').slice(0, 6);
    return text;
  }

  async function save() {
    if (!payer || !fileType) return;
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    setStatus('saving');
    try {
      await savePayrollBank(payer);
      setStatus('saved');
      if (from === 'payroll') back();
    } catch {
      setStatus('error');
    }
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Payroll Bank Details" onBack={back} />

      <Card title="Country" icon={{ ios: 'globe', android: 'public', web: 'public' }}>
        <FormField label="Where your business pays its staff">
          <FieldButton
            value={country ? countryName(country) : null}
            placeholder="Select country"
            icon={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
            onPress={() => setCountryOpen(true)}
            accessibilityLabel="Country"
          />
        </FormField>
        <Text style={ownerStyles.mutedText}>
          {fileType
            ? `Payroll makes an ${PAYMENT_FILE_LABEL[fileType]} you upload to your bank's bulk payments page. Your team enters their bank details in this country's format.`
            : country
              ? `Bank payment files aren't available for ${countryName(country)} yet. You can still approve payroll, pay your team through your bank, then mark each pay run as paid.`
              : 'Choose your country so payroll knows which bank file to make.'}
        </Text>
        <OptionSheet
          visible={countryOpen}
          title="Country"
          options={COUNTRY_NAMES}
          value={country ? countryName(country) : null}
          onSelect={(name) => {
            const code = COUNTRIES.find((c) => c.name === name)?.code ?? 'OTHER';
            updateBusiness({ country: code });
            setTried(false);
          }}
          onClose={() => setCountryOpen(false)}
        />
      </Card>

      {fileType && (
        <Card title="Account wages are paid from" icon={OwnerIcons.bank}>
          {!payer ? (
            <ActivityIndicator color={C.accent} />
          ) : (
            <>
              {status === 'load-error' && (
                <Text style={styles.error}>Your saved details couldn&apos;t be loaded. Check your internet connection.</Text>
              )}
              {payerFieldsFor(fileType).map((f) => (
                <FormField key={f.key} label={f.optional ? `${f.label} (optional)` : f.label} error={tried ? errors[f.key] : undefined}>
                  <TextField
                    value={payer[f.key]}
                    onChangeText={(t) => set(f.key, t)}
                    placeholder={f.placeholder}
                    keyboardType={f.numeric ? 'number-pad' : 'default'}
                    autoCapitalize={f.key === 'accountName' || f.key === 'bankName' ? 'words' : 'characters'}
                    autoCorrect={false}
                    accessibilityLabel={f.label}
                  />
                  <Text style={styles.hint}>{f.hint}</Text>
                </FormField>
              ))}

              {fileType === 'aba' && (
                <FormField label="Add a balancing line?">
                  <Segmented
                    options={[
                      { value: 'no', label: 'No' },
                      { value: 'yes', label: 'Yes' },
                    ]}
                    value={payer.abaBalancing ? 'yes' : 'no'}
                    onChange={(v) => setPayer({ ...payer, abaBalancing: v === 'yes' })}
                  />
                  <Text style={styles.hint}>
                    Some banks (e.g. Westpac, St.George) want a final line that takes the total from your account. Leave
                    as No unless your bank says otherwise.
                  </Text>
                </FormField>
              )}

              <View style={styles.actions}>
                <Button
                  label={status === 'saving' ? 'Saving…' : 'Save Bank Details'}
                  icon={OwnerIcons.check}
                  disabled={status === 'saving'}
                  onPress={save}
                />
              </View>
              {status === 'saved' && <Text style={styles.saved}>Saved. You can now download payment files.</Text>}
              {status === 'error' && <Text style={styles.error}>Couldn&apos;t save. Check your internet connection and try again.</Text>}
              {tried && Object.keys(errors).length > 0 && <Text style={styles.error}>Please fix the boxes marked above.</Text>}
            </>
          )}
        </Card>
      )}

      <Text style={ownerStyles.mutedText}>
        Only you can see these details. They&apos;re only used to make your payroll bank files.
      </Text>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    marginTop: Spacing.one,
  },
  saved: {
    color: C.success,
    fontSize: 13,
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
});
