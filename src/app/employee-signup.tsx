import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';

import { StepAccount } from '@/components/employee-signup/step-account';
import { StepAdditional } from '@/components/employee-signup/step-additional';
import { StepBank } from '@/components/employee-signup/step-bank';
import { StepJoin } from '@/components/employee-signup/step-join';
import { StepPersonal } from '@/components/employee-signup/step-personal';
import { StepReview } from '@/components/employee-signup/step-review';
import { StepSuccess } from '@/components/employee-signup/step-success';
import { EMPLOYEE_STEP_NAMES, EMPTY_EMPLOYEE_SIGNUP, type EmployeeSignupData } from '@/components/employee-signup/types';
import { SignupColors as C } from '@/components/signup/fields';
import { SignupShell } from '@/components/signup/signup-shell';
import { signUp } from '@/lib/auth';
import { completeEmployeeSignup, findInvite, saveQualifications } from '@/lib/employee-signup';
import { reloadSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const STEPS = [
  { title: 'Create your account', subtitle: 'Join your employer on NexGain to access your schedule, job information and payments.' },
  { title: 'Join your employer', subtitle: 'Enter the business code or invite link your employer gave you.' },
  { title: 'Personal details', subtitle: 'Tell your employer a little about you.' },
  { title: 'Bank details', subtitle: 'Where your pay will be sent.' },
  { title: 'Additional information', subtitle: 'Tax, super, an emergency contact and your qualifications.' },
  { title: 'Review & complete', subtitle: 'Check your details before creating your account.' },
];
const REVIEW = 5;
const SUCCESS = 6;

/**
 * Employee sign-up: 6 steps plus a success screen. Opens with ?code=... from an
 * invite link, plus &invite=... from the owner's personal invite (pre-fills their details).
 */
export default function EmployeeSignupScreen() {
  const params = useLocalSearchParams<{ code?: string; invite?: string }>();
  const [data, setData] = useState<EmployeeSignupData>(() =>
    params.code
      ? { ...EMPTY_EMPLOYEE_SIGNUP, code: params.code.toUpperCase(), inviteId: params.invite ?? null }
      : EMPTY_EMPLOYEE_SIGNUP,
  );
  const [step, setStep] = useState(0);
  const [returnToReview, setReturnToReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedUploads, setFailedUploads] = useState<string[]>([]);
  const [joinedBusiness, setJoinedBusiness] = useState('');

  const update = (changes: Partial<EmployeeSignupData>) => setData((d) => ({ ...d, ...changes }));

  // Personal invite: fill in what the owner already entered (only empty fields).
  useEffect(() => {
    if (!params.code || !params.invite) return;
    let cancelled = false;
    findInvite(params.code, params.invite).then((invite) => {
      if (!invite || cancelled) return;
      setData((d) => ({
        ...d,
        fullName: d.fullName || invite.fullName,
        email: d.email || invite.email,
        phone: d.phone || invite.phone,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [params.code, params.invite]);

  function goBack() {
    setError(null);
    if (step > 0) setStep(step - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/employee-access');
  }

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0 || step === SUCCESS) return false;
      setStep((s) => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  function goNext() {
    setError(null);
    if (returnToReview) {
      setReturnToReview(false);
      setStep(REVIEW);
      return;
    }
    // Pre-fill the name on Personal Details from step 1.
    setStep(step + 1);
  }

  async function createAccount() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Reuse the account if a previous attempt already created it (e.g. connection dropped).
      const { data: existing } = await supabase.auth.getUser();
      const signedInAsThem = existing.user?.email?.toLowerCase() === data.email.trim().toLowerCase();
      if (!signedInAsThem) {
        const signUpError = await signUp(data.email, data.password, data.fullName);
        if (signUpError) {
          setError(signUpError);
          if (signUpError.includes('already exists')) setStep(0);
          return;
        }
      }
      const employee = await completeEmployeeSignup(data);
      const failed = await saveQualifications({ id: employee.id, businessId: employee.business_id }, data.qualifications);
      await reloadSession();
      setFailedUploads(failed);
      setJoinedBusiness(data.business?.name ?? 'your employer');
      // Don't keep sensitive details in memory once they're saved.
      setData((d) => ({ ...d, password: '', bsb: '', accountNumber: '', iban: '', bic: '', tfn: '' }));
      setStep(SUCCESS);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes("couldn't find a business")
          ? "We couldn't find a business with that code. Check with your employer."
          : message.includes('already joined')
            ? 'This account has already joined a business. Please log in instead.'
            : `We couldn't create your account. ${message || 'Please try again.'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const nextLabel = returnToReview ? 'Back to Review' : 'Next';
  const stepProps = { data, update, onNext: goNext, nextLabel };

  if (step === SUCCESS) {
    return (
      <SignupShell steps={EMPLOYEE_STEP_NAMES} complete step={REVIEW} title="" onBack={() => {}} onSelectStep={() => {}}>
        <StepSuccess businessName={joinedBusiness} failedUploads={failedUploads} onDashboard={() => router.replace('/home')} />
      </SignupShell>
    );
  }

  return (
    <SignupShell
      steps={EMPLOYEE_STEP_NAMES}
      step={step}
      title={STEPS[step].title}
      subtitle={STEPS[step].subtitle}
      onBack={goBack}
      onSelectStep={(s) => {
        setError(null);
        setReturnToReview(false);
        setStep(s);
      }}>
      {error && (
        <View style={styles.error} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {step === 0 && <StepAccount {...stepProps} />}
      {step === 1 && <StepJoin {...stepProps} />}
      {step === 2 && <StepPersonal {...stepProps} />}
      {step === 3 && <StepBank {...stepProps} />}
      {step === 4 && <StepAdditional {...stepProps} />}
      {step === REVIEW && (
        <StepReview
          data={data}
          busy={busy}
          onCreate={createAccount}
          onEdit={(s) => {
            setReturnToReview(true);
            setStep(s);
          }}
        />
      )}
    </SignupShell>
  );
}

const styles = StyleSheet.create({
  error: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    color: C.danger,
    fontSize: 14,
    lineHeight: 20,
  },
});
