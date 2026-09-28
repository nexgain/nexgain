import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';

import { SignupColors as C } from '@/components/signup/fields';
import { SignupShell } from '@/components/signup/signup-shell';
import { StepAccount } from '@/components/signup/step-account';
import { StepBusiness } from '@/components/signup/step-business';
import { StepConnect } from '@/components/signup/step-connect';
import { StepFinancial } from '@/components/signup/step-financial';
import { StepServices } from '@/components/signup/step-services';
import { StepSubscription } from '@/components/signup/step-subscription';
import { StepTeam } from '@/components/signup/step-team';
import { StepType } from '@/components/signup/step-type';
import { EMPTY_SIGNUP, STEP_NAMES, type SignupData } from '@/components/signup/types';
import { createBusinessOnline, updateBusiness, type BusinessProfile } from '@/data/business';
import { DEFAULT_SELECTED_COUNT, findIndustry, industryDefaults } from '@/data/industries';
import { signUp } from '@/lib/auth';
import { reloadSession } from '@/lib/session';

const STEPS = [
  { title: 'Create your account', subtitle: "Let's get started. Create your NexGain owner account." },
  { title: 'Business details', subtitle: 'Tell us about your business.' },
  { title: 'Business type & details', subtitle: 'A few more details about how your business runs.' },
  { title: 'Services you provide', subtitle: 'Choose the services you offer. These appear when you create quotes and invoices.' },
  { title: 'Subscription & payment', subtitle: 'Start your NexGain subscription.' },
  { title: 'Financial year & accounting', subtitle: 'Set up how NexGain handles your financial year and GST.' },
  { title: 'Connect bank & accounting', subtitle: 'Connect your bank and accounting software. You can also do this later.' },
  { title: 'Team & payroll setup', subtitle: 'Invite your team to join your business on NexGain.' },
];

const TEAM_STEP = 7;

/** The business details from sign-up, in the shape the rest of the app uses. */
function toProfile(data: SignupData): Omit<BusinessProfile, 'id' | 'inviteCode' | 'createdAt'> {
  return {
    ownerName: data.fullName.trim(),
    email: data.email.trim(),
    businessName: data.businessName.trim(),
    logo: data.logo,
    abn: data.abn,
    industry: data.industry?.name ?? data.industryText.trim(),
    industryCategory: data.industry?.category ?? null,
    businessType: data.businessType,
    teamSize: data.teamSize,
    vehicles: data.vehicles,
    yearsOperating: data.yearsOperating ?? '',
    services: data.services,
    plan: 'basic',
    financialYearStartMonth: data.financialYearStartMonth,
    gstRegistered: data.gstRegistered,
    currency: data.currency,
    trackGstInReports: data.trackGstInReports,
    bankConnected: false,
    accountingSoftware: null,
  };
}

/**
 * Owner sign-up: 8 steps. Leaving step 7 creates the real account and the
 * business online (so step 8 can show the real invite code); finishing opens the Dashboard.
 */
export default function OwnerSignupScreen() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SignupData>(EMPTY_SIGNUP);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (changes: Partial<SignupData>) => setData((d) => ({ ...d, ...changes }));
  const accountCreated = inviteCode !== null;

  function goBack() {
    setError(null);
    if (step > 0) {
      setStep(step - 1);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/owner-access');
    }
  }

  // Android's back button steps back through sign-up instead of leaving it.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      setStep((s) => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  async function createAccount() {
    setBusy(true);
    setError(null);
    try {
      // The password goes straight to Supabase's secure login system; the app never stores it.
      const signUpError = await signUp(data.email, data.password, data.fullName);
      if (signUpError) {
        setError(signUpError);
        if (signUpError.includes('already exists')) setStep(0);
        return false;
      }
      const business = await createBusinessOnline(toProfile(data));
      // Start loading the new owner's data and live notifications.
      await reloadSession();
      setInviteCode(business.inviteCode);
      return true;
    } catch (e) {
      setError(`We couldn't create your business: ${e instanceof Error ? e.message : 'please try again.'}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    if (busy) return;
    setError(null);
    const industryName = data.industry?.name ?? null;
    const industry = data.industry?.category && industryName ? findIndustry(industryName) : null;

    // Entering Business Type: pre-fill sensible defaults for a newly chosen industry.
    if (step === 1 && industryName !== data.prefilledFor) {
      update({ ...industryDefaults(industry), prefilledFor: industryName });
    }
    // Entering Services: tick the most common services for a newly chosen industry.
    if (step === 2 && industryName !== data.servicesFor) {
      update({ services: industry ? industry.services.slice(0, DEFAULT_SELECTED_COUNT) : [], servicesFor: industryName });
    }
    // Entering Team & Payroll: create the account and business (only once).
    if (step === TEAM_STEP - 1 && !accountCreated) {
      const ok = await createAccount();
      if (!ok) return;
    }
    setStep(step + 1);
  }

  function finish() {
    // Save any business details changed after the account was created (e.g. by going back a step).
    const { email: _email, ...editable } = toProfile(data);
    updateBusiness(editable);
    router.replace('/dashboard');
  }

  const stepProps = { data, update, onNext: goNext };

  return (
    <SignupShell
      steps={STEP_NAMES}
      step={step}
      title={STEPS[step].title}
      subtitle={STEPS[step].subtitle}
      onBack={goBack}
      onSelectStep={(s) => {
        setError(null);
        setStep(s);
      }}>
      {error && (
        <View style={styles.error} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {step === 0 && accountCreated && (
        <Text style={styles.note}>Your account has already been created. Changes to your email or password here won&apos;t be saved.</Text>
      )}
      {step === 0 && <StepAccount {...stepProps} />}
      {step === 1 && <StepBusiness {...stepProps} />}
      {step === 2 && <StepType {...stepProps} />}
      {step === 3 && <StepServices {...stepProps} />}
      {step === 4 && <StepSubscription {...stepProps} />}
      {step === 5 && <StepFinancial {...stepProps} />}
      {step === 6 && <StepConnect {...stepProps} />}
      {step === 6 && busy && (
        <View style={styles.busy}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.note}>Creating your account and business…</Text>
        </View>
      )}
      {step === TEAM_STEP && inviteCode && <StepTeam inviteCode={inviteCode} onFinish={finish} />}
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
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  note: {
    color: C.textSecondary,
    fontSize: 14,
  },
});
