import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { BackHandler, Platform } from 'react-native';

import { SignupShell } from '@/components/signup/signup-shell';
import { StepAccount } from '@/components/signup/step-account';
import { StepBusiness } from '@/components/signup/step-business';
import { StepConnect } from '@/components/signup/step-connect';
import { StepFinancial } from '@/components/signup/step-financial';
import { StepServices } from '@/components/signup/step-services';
import { StepSubscription } from '@/components/signup/step-subscription';
import { StepTeam } from '@/components/signup/step-team';
import { StepType } from '@/components/signup/step-type';
import { EMPTY_SIGNUP, type SignupData } from '@/components/signup/types';
import { makeInviteCode, saveBusiness } from '@/data/business';
import { DEFAULT_SELECTED_COUNT, findIndustry, industryDefaults } from '@/data/industries';

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

/** Owner sign-up: 8 steps, then the business profile is saved and the owner lands on the Dashboard. */
export default function OwnerSignupScreen() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SignupData>(EMPTY_SIGNUP);

  const update = (changes: Partial<SignupData>) => setData((d) => ({ ...d, ...changes }));

  function goBack() {
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

  function goNext() {
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
    setStep(step + 1);
  }

  const inviteCode = makeInviteCode(data.fullName, data.businessName);

  function finish() {
    // Save the business profile (the password is deliberately not saved: there
    // are no real accounts yet, so storing it on the phone would only be a risk).
    saveBusiness({
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
      inviteCode,
      createdAt: new Date().toISOString(),
    });
    // "Log in": there's no account check yet, so go straight to the Owner Dashboard.
    router.replace('/dashboard');
  }

  const stepProps = { data, update, onNext: goNext };

  return (
    <SignupShell
      step={step}
      title={STEPS[step].title}
      subtitle={STEPS[step].subtitle}
      onBack={goBack}
      onSelectStep={setStep}>
      {step === 0 && <StepAccount {...stepProps} />}
      {step === 1 && <StepBusiness {...stepProps} />}
      {step === 2 && <StepType {...stepProps} />}
      {step === 3 && <StepServices {...stepProps} />}
      {step === 4 && <StepSubscription {...stepProps} />}
      {step === 5 && <StepFinancial {...stepProps} />}
      {step === 6 && <StepConnect {...stepProps} />}
      {step === 7 && <StepTeam inviteCode={inviteCode} onFinish={finish} />}
    </SignupShell>
  );
}
