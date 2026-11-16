// Owner sign-up step 4, NexGain Bookings only: the services customers can book.
// Pre-filled from the business types chosen in step 2 (prices only for
// Australian businesses; everyone else enters their own), all editable.
// Also asks "Do you do the work yourself?" (changeable later in Bookings Settings).
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SelectField } from '@/components/employee/form-fields';
import { Button, Checkbox, Field, Icon, Note, SignupColors as C } from '@/components/signup/fields';
import { CURRENCIES } from '@/components/signup/step-financial';
import type { StepProps } from '@/components/signup/types';
import { COUNTRIES, isEurozone } from '@/lib/payment-files/countries';
import { findBookingType, presetServices, type ServiceDraft } from '@/systems/bookings/constants/booking-business-types';

const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

/** The usual currency for a country (the same choice the Financial Year step makes). */
function currencyFor(code: string) {
  if (isEurozone(code)) return 'EUR – Euro';
  const prefix = ({ AU: 'AUD', NZ: 'NZD', US: 'USD', GB: 'GBP', CA: 'CAD' } as Record<string, string>)[code];
  return CURRENCIES.find((c) => c.startsWith(`${prefix} `)) ?? null;
}

/** "$", "£" or "€" for the business's currency. */
export function currencySymbol(currency: string) {
  const code = currency.slice(0, 3).toUpperCase();
  return code === 'GBP' ? '£' : code === 'EUR' ? '€' : '$';
}

/** "45" -> 45; "" or not a price -> null. */
const parsePrice = (text: string) => {
  const t = text.trim().replace(/,/g, '');
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null;
};

/** What still needs doing before Next (null = ready). */
export function bookingServicesProblem(data: StepProps['data']): string | null {
  if (!data.country) return 'Choose the country your business is in.';
  const chosen = data.bookingServices.filter((s) => s.selected);
  if (chosen.length === 0) return 'Tick at least one service, or add your own.';
  if (chosen.some((s) => !s.name.trim())) return 'Give every ticked service a name.';
  if (chosen.some((s) => !(s.minutes >= 5 && s.minutes <= 720))) return 'Enter how long each service takes, in minutes (5 to 720).';
  if (chosen.some((s) => s.price === null)) return 'Enter a price for every ticked service.';
  if (data.ownerWorks === null) return 'Answer “Do you do the work yourself?”.';
  return null;
}

export function StepBookingServices({ data, update, onNext }: StepProps) {
  const [tried, setTried] = useState(false);
  const symbol = currencySymbol(data.currency);
  const main = data.bookingTypes[0] ? findBookingType(data.bookingTypes[0]) : null;
  const ownCategory = main && !main.other ? main.name : data.industryText.trim() || 'Services';
  const forKey = data.bookingTypes.join(',');

  // New business types chosen: start from their preset services.
  useEffect(() => {
    if (data.bookingServicesFor === forKey) return;
    const presets = presetServices(data.bookingTypes, data.country || null);
    update({
      bookingServicesFor: forKey,
      bookingServices: presets.length ? presets : [{ key: 'custom:0', name: '', minutes: 30, price: null, category: ownCategory, selected: true }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forKey]);

  const list = data.bookingServices;
  const change = (key: string, changes: Partial<ServiceDraft>) =>
    update({ bookingServices: list.map((s) => (s.key === key ? { ...s, ...changes } : s)) });

  function chooseCountry(name: string) {
    const code = COUNTRIES.find((c) => c.name === name)?.code ?? 'OTHER';
    const changes: Partial<StepProps['data']> = { country: code, currency: currencyFor(code) ?? data.currency };
    // Australian businesses: fill in the suggested prices for any left blank.
    if (code === 'AU') {
      const suggested = new Map(presetServices(data.bookingTypes, 'AU').map((s) => [s.key, s.price]));
      changes.bookingServices = list.map((s) => (s.price === null && suggested.has(s.key) ? { ...s, price: suggested.get(s.key) ?? null } : s));
    }
    update(changes);
  }

  function addService() {
    const n = list.filter((s) => s.key.startsWith('custom:')).length;
    update({ bookingServices: [...list, { key: `custom:${n}-${Date.now()}`, name: '', minutes: 30, price: null, category: ownCategory, selected: true }] });
  }

  const problem = bookingServicesProblem(data);

  return (
    <>
      <Field
        label="Country"
        error={tried && !data.country && 'Choose the country your business is in.'}
        hint={data.country === 'AU' ? 'Suggested prices are filled in. Change them to yours.' : 'Enter your own price for each service.'}>
        <SelectField
          title="Country"
          value={COUNTRIES.find((c) => c.code === data.country)?.name ?? null}
          options={COUNTRY_NAMES}
          placeholder="Select country"
          onChange={chooseCountry}
          hasError={tried && !data.country}
        />
      </Field>

      <Field label="Your services" hint={`Prices in ${data.currency.slice(0, 3)} (${symbol}). Untick any you don’t offer. Everything can be changed later.`}>
        <View style={styles.list}>
          {list.map((s) => (
            <ServiceRow key={s.key} service={s} symbol={symbol} tried={tried} onChange={(c) => change(s.key, c)} />
          ))}
        </View>
        <Button label="Add service" variant="secondary" icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={addService} />
      </Field>

      <Field label="Do you do the work yourself?" error={tried && data.ownerWorks === null && 'Choose Yes or No.'}>
        <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Do you do the work yourself?">
          {[
            { value: true, title: 'Yes', text: 'Customers can book me. I get a schedule and set my own prices.' },
            { value: false, title: 'No', text: 'I only manage the business. Customers book my staff, not me.' },
          ].map((o) => {
            const on = data.ownerWorks === o.value;
            return (
              <Pressable
                key={o.title}
                onPress={() => update({ ownerWorks: o.value })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${o.title}. ${o.text}`}
                style={[styles.option, on && styles.optionOn]}>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle}>{o.title}</Text>
                  <Text style={styles.muted}>{o.text}</Text>
                </View>
                {on && <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} color={C.primary} size={20} />}
              </Pressable>
            );
          })}
        </View>
        <Note>You can change this later in Bookings Settings.</Note>
      </Field>

      {tried && problem && <Text style={styles.error}>{problem}</Text>}
      <Button
        label="Next"
        arrow
        onPress={() => {
          setTried(true);
          if (!problem) onNext();
        }}
      />
    </>
  );
}

function ServiceRow({
  service: s,
  symbol,
  tried,
  onChange,
}: {
  service: ServiceDraft;
  symbol: string;
  tried: boolean;
  onChange: (c: Partial<ServiceDraft>) => void;
}) {
  // What's being typed (so "45." isn't lost while typing).
  const [priceText, setPriceText] = useState<string | null>(null);
  const [minutesText, setMinutesText] = useState<string | null>(null);
  const shownPrice = priceText ?? (s.price === null ? '' : String(s.price));
  const shownMinutes = minutesText ?? String(s.minutes || '');
  const missing = (bad: boolean) => tried && s.selected && bad;

  return (
    <View style={[styles.row, !s.selected && styles.rowOff]}>
      <Pressable
        onPress={() => onChange({ selected: !s.selected })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: s.selected }}
        accessibilityLabel={`Offer ${s.name || 'this service'}`}
        hitSlop={8}
        style={styles.tick}>
        <Checkbox checked={s.selected} />
      </Pressable>
      <View style={styles.flex}>
        <TextInput
          value={s.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Service name"
          placeholderTextColor={C.muted}
          maxLength={100}
          accessibilityLabel="Service name"
          style={[styles.input, styles.name, missing(!s.name.trim()) && styles.inputError]}
        />
        <View style={styles.numbers}>
          <View style={[styles.box, missing(!(s.minutes >= 5 && s.minutes <= 720)) && styles.inputError]}>
            <TextInput
              value={shownMinutes}
              onChangeText={(t) => {
                const clean = t.replace(/\D/g, '').slice(0, 3);
                setMinutesText(clean);
                onChange({ minutes: Number(clean) || 0 });
              }}
              onBlur={() => setMinutesText(null)}
              keyboardType="number-pad"
              accessibilityLabel={`How long ${s.name || 'this service'} takes, in minutes`}
              style={styles.boxInput}
            />
            <Text style={styles.unit}>min</Text>
          </View>
          <View style={[styles.box, missing(s.price === null) && styles.inputError]}>
            <Text style={styles.unit}>{symbol}</Text>
            <TextInput
              value={shownPrice}
              onChangeText={(t) => {
                setPriceText(t);
                onChange({ price: parsePrice(t) });
              }}
              onBlur={() => setPriceText(null)}
              placeholder="Price"
              placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
              maxLength={10}
              accessibilityLabel={`Price for ${s.name || 'this service'}`}
              style={styles.boxInput}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 8 },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  error: { color: C.danger, fontSize: 14, lineHeight: 20 },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  rowOff: { opacity: 0.55 },
  tick: { paddingTop: 12 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
    color: C.text,
    fontSize: 15,
  },
  name: { fontWeight: '600' },
  inputError: { borderColor: C.danger },
  numbers: { flexDirection: 'row', gap: 8 },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  boxInput: { flex: 1, minWidth: 0, color: C.text, fontSize: 15, paddingVertical: 8 },
  unit: { color: C.textSecondary, fontSize: 15, fontWeight: '600' },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  optionOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  optionTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
});
