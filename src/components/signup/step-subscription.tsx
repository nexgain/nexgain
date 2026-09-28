import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, fieldStyles, Icon, Input, Note, SignupColors as C } from '@/components/signup/fields';
import type { StepProps } from '@/components/signup/types';

const FEATURES = [
  'Unlimited quotes & invoices',
  'Rostering & scheduling',
  'Payroll & payslips',
  'Employee app access',
  'Job reports & notifications',
  'Reports & analytics',
  'AI assistant & insights',
  'Email support',
];

const formatCard = (t: string) => t.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatExpiry = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

export function StepSubscription({ onNext }: StepProps) {
  // Card details stay inside this screen only. They are never added to the
  // sign-up data, saved on the phone, or sent anywhere.
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  function startSubscription() {
    // TODO(payments): connect a payment provider here (e.g. Stripe). The card
    // fields above should be replaced by the provider's secure card input
    // (such as Stripe's CardField / PaymentSheet) so card numbers never touch
    // our app or servers, and the subscription is created on the provider.
    // For now there is no payment system, so this just moves to the next step.
    onNext();
  }

  return (
    <>
      <View style={[fieldStyles.card, styles.plan]}>
        <View style={styles.planHeader}>
          <View>
            <Text style={styles.planName}>Basic Plan</Text>
            <Text style={styles.planSub}>Everything you need to run your business</Text>
          </View>
          <View style={styles.priceWrap}>
            <Text style={styles.price}>$79</Text>
            <Text style={styles.per}>/month</Text>
          </View>
        </View>
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.feature}>
              <View style={styles.featureTick}>
                <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color="#FFFFFF" size={10} />
              </View>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Payment details</Text>
      <Field label="Card number">
        <Input
          value={card}
          onChangeText={(t) => setCard(formatCard(t))}
          placeholder="1234 5678 9012 3456"
          keyboardType="number-pad"
          autoComplete="off"
          accessibilityLabel="Card number"
          icon={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' }}
        />
      </Field>
      <View style={fieldStyles.row}>
        <View style={fieldStyles.flex}>
          <Field label="Expiry">
            <Input value={expiry} onChangeText={(t) => setExpiry(formatExpiry(t))} placeholder="MM/YY" keyboardType="number-pad" autoComplete="off" accessibilityLabel="Expiry" />
          </Field>
        </View>
        <View style={fieldStyles.flex}>
          <Field label="CVC">
            <Input value={cvc} onChangeText={(t) => setCvc(t.replace(/\D/g, '').slice(0, 4))} placeholder="123" keyboardType="number-pad" autoComplete="off" secureTextEntry accessibilityLabel="CVC" />
          </Field>
        </View>
      </View>

      <Button label="Start Subscription" arrow onPress={startSubscription} />
      <Note>You won&apos;t be charged until after your first month. You can cancel anytime.</Note>
    </>
  );
}

const styles = StyleSheet.create({
  plan: {
    borderColor: C.primary,
    borderWidth: 1.5,
    backgroundColor: C.primarySoft,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  planName: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
  },
  planSub: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  price: {
    color: C.text,
    fontSize: 28,
    fontWeight: '800',
  },
  per: {
    color: C.textSecondary,
    fontSize: 14,
    marginBottom: 4,
  },
  features: {
    gap: 8,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureTick: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.done,
  },
  featureText: {
    color: C.text,
    fontSize: 14,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
  },
});
