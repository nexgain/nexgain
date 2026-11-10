import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';

import { StepAccount } from '@/components/employee-signup/step-account';
import { StepAdditional } from '@/components/employee-signup/step-additional';
import { StepBank } from '@/components/employee-signup/step-bank';
import { StepJoin } from '@/components/employee-signup/step-join';
import { StepPersonal } from '@/components/employee-signup/step-personal';
import { StepReview } from '@/components/employee-signup/step-review';
import { StepSuper } from '@/components/employee-signup/step-super';
import { StepSuccess } from '@/components/employee-signup/step-success';
import { EMPTY_EMPLOYEE_SIGNUP, employeeSteps, type EmployeeSignupData, type EmployeeStepId } from '@/components/employee-signup/types';
import { SignupColors as C } from '@/components/signup/fields';
import { SignupShell } from '@/components/signup/signup-shell';
import { signUp } from '@/lib/auth';
import { completeEmployeeSignup, findInvite, saveQualifications } from '@/lib/employee-signup';
import { reloadSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Shown after the last step. */
const SUCCESS = -1;

/**
 * Employee sign-up: 6 or 7 steps ("Your super fund" only for Australian
 * businesses; see employeeSteps) plus a success screen. Opens with ?code=... from an
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
  const steps = employeeSteps(data);
  const stepNames = steps.map((s) => s.name);
  const REVIEW = steps.length - 1;
  const indexOf = (id: EmployeeStepId) => steps.findIndex((s) => s.id === id);
  const current = steps[step]?.id;

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
      if (step <= 0) return false;
      setStep((s) => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  // The steps change once the business (and its country) is known: stay on a real step.
  if (step !== SUCCESS && step > REVIEW) setStep(REVIEW);

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
      <SignupShell steps={stepNames} complete step={REVIEW} title="" onBack={() => {}} onSelectStep={() => {}}>
        <StepSuccess businessName={joinedBusiness} failedUploads={failedUploads} onDashboard={() => router.replace('/home')} />
      </SignupShell>
    );
  }

  return (
    <SignupShell
      steps={stepNames}
      step={step}
      title={steps[step].title}
      subtitle={steps[step].subtitle}
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
      {current === 'account' && <StepAccount {...stepProps} />}
      {current === 'join' && <StepJoin {...stepProps} />}
      {current === 'personal' && <StepPersonal {...stepProps} />}
      {current === 'bank' && <StepBank {...stepProps} />}
      {current === 'super' && <StepSuper {...stepProps} />}
      {current === 'additional' && <StepAdditional {...stepProps} />}
      {current === 'review' && (
        <StepReview
          data={data}
          busy={busy}
          onCreate={createAccount}
          onEdit={(id) => {
            setReturnToReview(true);
            setStep(Math.max(0, indexOf(id)));
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
    borderColor: C.dangerBorder,
    backgroundColor: C.dangerSoft,
  },
  errorText: {
    color: C.danger,
    fontSize: 14,
    lineHeight: 20,
  },
});
