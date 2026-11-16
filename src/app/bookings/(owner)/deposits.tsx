import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceRow, SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { parsePriceText } from '@/systems/bookings/components/owner/staff-prices-card';
import { FormField, SwitchRow, TextField } from '@/systems/bookings/components/owner/form';
import { Segmented } from '@/systems/bookings/components/owner/invoices-ui';
import { Card, goBack, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import {
  cancellationFeeFor,
  currencyCode,
  depositFor,
  formatPrice,
  updateBookingSettings,
  useBookingServices,
  useBookingSettings,
  type BookingSettings,
} from '@/systems/bookings/data/bookings';

const AMOUNT_TYPES = [
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'percent', label: '% of the price' },
] as const;
const WINDOW_CHOICES = [1, 2, 4, 6, 12, 24, 48, 72].map((h) => ({ value: h, label: `Less than ${h} hour${h === 1 ? '' : 's'} before` }));

type Message = { tone: 'ok' | 'error'; text: string } | null;

// More > Deposits & Cancellation Fees (NexGain Bookings): a deposit when
// customers book, and a fee for cancelling late. Customers see these before
// they confirm. Payments run through supabase/functions/_shared/paymentService.ts
// (test mode until Stripe is connected).
export default function DepositsScreen() {
  const settings = useBookingSettings();
  const example = useBookingServices().find((s) => s.active && s.price !== null) ?? null;
  const [depositText, setDepositText] = useState<string | null>(null);
  const [feeText, setFeeText] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  if (!settings) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack()} title="Deposits & Cancellation Fees" />
        <Card>
          <Text style={styles.muted}>Loading…</Text>
        </Card>
      </OwnerScreen>
    );
  }

  async function save(changes: Partial<BookingSettings>) {
    const error = await updateBookingSettings(changes);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: 'Saved. Customers see this on your booking page straight away.' });
  }

  /** Saves a typed amount (dollars, or a % up to 100). */
  async function saveAmount(text: string | null, type: 'fixed' | 'percent', key: 'depositValue' | 'cancellationFeeValue', reset: () => void) {
    if (text === null) return;
    const value = parsePriceText(text);
    if (value === undefined || value === null || (type === 'percent' && value > 100)) {
      setMessage({ tone: 'error', text: type === 'percent' ? 'Enter a percentage from 0 to 100.' : 'Enter an amount, e.g. 20 or 20.50.' });
      return;
    }
    await save({ [key]: value } as Partial<BookingSettings>);
    reset();
  }

  const depositsOn = settings.depositType !== 'none';
  const depositType = settings.depositType === 'percent' ? 'percent' : 'fixed';
  const unit = (type: 'fixed' | 'percent') => (type === 'percent' ? '%' : currencyCode());
  const exampleDeposit = example ? depositFor(example.price, settings) : 0;
  const exampleFee = example ? cancellationFeeFor(example.price, settings) : 0;

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Deposits & Cancellation Fees"
        subtitle="Take a deposit when customers book, and charge a fee if they cancel late. Customers see this before they confirm."
      />
      <SaveNote message={message} />

      <View style={styles.testNote}>
        <Text style={styles.testTitle}>Test mode</Text>
        <Text style={styles.muted}>
          Card payments aren’t connected yet, so deposits and fees are pretend: customers go through the steps but nothing is charged. Once Stripe
          is connected, the same settings take real payments.
        </Text>
      </View>

      <Card title="Deposit" icon={OwnerIcons.wallet}>
        <SwitchRow
          label="Take a deposit when customers book"
          hint={depositsOn ? 'Paid by card on your booking page. It comes off the price on the day.' : 'Off: customers book without paying.'}
          value={depositsOn}
          onChange={(on) => save(on ? { depositType: 'fixed', depositValue: settings.depositValue || 20 } : { depositType: 'none' })}
        />
        {depositsOn && (
          <>
            <Segmented
              options={AMOUNT_TYPES}
              value={depositType}
              onChange={(type) => save({ depositType: type, depositValue: type === 'percent' ? Math.min(settings.depositValue, 100) : settings.depositValue })}
            />
            <FormField label={depositType === 'percent' ? 'Deposit (% of the price)' : `Deposit amount (${unit('fixed')})`}>
              <TextField
                value={depositText ?? String(settings.depositValue)}
                onChangeText={setDepositText}
                onBlur={() => saveAmount(depositText, depositType, 'depositValue', () => setDepositText(null))}
                keyboardType="decimal-pad"
                maxLength={10}
                accessibilityLabel="Deposit amount"
              />
            </FormField>
            {depositType === 'fixed' && <Text style={styles.muted}>Never more than the price of the service.</Text>}
          </>
        )}
      </Card>

      <Card title="Cancellation Fee" icon={OwnerIcons.clock}>
        <SwitchRow
          label="Charge a fee for late cancellations"
          hint={
            settings.cancellationFeeEnabled
              ? 'Customers can cancel online right up to the appointment; late ones are charged the fee (taken from the deposit first).'
              : `Off: customers can cancel online up to ${settings.cancelNoticeHours} hours before, free (set in Bookings Settings).`
          }
          value={settings.cancellationFeeEnabled}
          onChange={(cancellationFeeEnabled) =>
            save({ cancellationFeeEnabled, ...(cancellationFeeEnabled && !settings.cancellationFeeValue ? { cancellationFeeValue: 20 } : {}) })
          }
        />
        {settings.cancellationFeeEnabled && (
          <>
            <Segmented
              options={AMOUNT_TYPES}
              value={settings.cancellationFeeType}
              onChange={(type) =>
                save({ cancellationFeeType: type, cancellationFeeValue: type === 'percent' ? Math.min(settings.cancellationFeeValue, 100) : settings.cancellationFeeValue })
              }
            />
            <FormField label={settings.cancellationFeeType === 'percent' ? 'Fee (% of the price)' : `Fee amount (${unit('fixed')})`}>
              <TextField
                value={feeText ?? String(settings.cancellationFeeValue)}
                onChangeText={setFeeText}
                onBlur={() => saveAmount(feeText, settings.cancellationFeeType, 'cancellationFeeValue', () => setFeeText(null))}
                keyboardType="decimal-pad"
                maxLength={10}
                accessibilityLabel="Cancellation fee amount"
              />
            </FormField>
            <ChoiceRow
              label="Counts as late"
              choices={WINDOW_CHOICES}
              value={settings.cancellationFeeHours}
              onChange={(cancellationFeeHours) => save({ cancellationFeeHours })}
            />
          </>
        )}
      </Card>

      <Card title="What Customers See" icon={OwnerIcons.info}>
        {example ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>
              For {example.name} ({formatPrice(example.price!)}):
            </Text>
            {exampleDeposit > 0 && (
              <Text style={styles.previewLine}>
                A deposit of {formatPrice(exampleDeposit)} is paid now to secure your booking. It comes off the price on the day.
              </Text>
            )}
            {exampleFee > 0 ? (
              <Text style={styles.previewLine}>
                Cancelling less than {settings.cancellationFeeHours} hours before your appointment: a {formatPrice(exampleFee)} cancellation fee
                {exampleDeposit > 0 ? ', taken from your deposit. Cancel earlier and your deposit is refunded in full.' : '.'}
              </Text>
            ) : (
              <Text style={styles.previewLine}>
                You can change or cancel online up to {settings.cancelNoticeHours} hours before{exampleDeposit > 0 ? ', and your deposit is refunded.' : '.'}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.muted}>Add a service with a price in Services & Prices to see a preview.</Text>
        )}
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  testNote: { gap: Spacing.one, padding: Spacing.three, borderRadius: Radius.medium, backgroundColor: C.warningSoft, borderWidth: 1, borderColor: C.warningBorder },
  testTitle: { color: C.warning, fontSize: 15, fontWeight: '700' },
  preview: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium, backgroundColor: C.warningSoft },
  previewTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  previewLine: { color: C.text, fontSize: 14, lineHeight: 20 },
});
