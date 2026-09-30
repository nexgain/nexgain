// Employee sign-up: find the business by invite code, then create the employee
// profile in that business. Bank details and TFN are sent once, over HTTPS, and
// stored encrypted by the database; they're never logged or kept in the app.
import type { EmployeeSignupData, FoundBusiness, SignupQualification } from '@/components/employee-signup/types';
import { addQualification } from '@/data/qualifications';
import { supabase } from '@/lib/supabase';

export async function findBusinessByCode(code: string): Promise<FoundBusiness | null> {
  const { data, error } = await supabase.rpc('find_business_by_code', { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  const row = (data as { id: string; name: string; logo: string | null; industry: string | null; industry_category: string | null }[])[0];
  return row ? { id: row.id, name: row.name, logo: row.logo, industry: row.industry, industryCategory: row.industry_category } : null;
}

/** Name / email / phone the owner entered, for a personal invite link. null if it's not valid. */
export async function findInvite(code: string, inviteId: string) {
  const { data, error } = await supabase.rpc('get_invite', { p_code: code.trim().toUpperCase(), p_invite: inviteId });
  if (error) return null;
  const row = (data as { full_name: string; email: string | null; phone: string | null }[])[0];
  return row ? { fullName: row.full_name, email: row.email ?? '', phone: row.phone ?? '' } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateOnly = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Creates the employee in the business. The person must already be signed in. */
export async function completeEmployeeSignup(data: EmployeeSignupData) {
  const superFund = data.superFund === 'Other' ? data.superFundOther.trim() : (data.superFund ?? '');
  const { data: row, error } = await supabase.rpc('complete_employee_signup', {
    p_code: data.businessCode,
    p: {
      full_name: data.fullName.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      date_of_birth: data.dateOfBirth ? dateOnly(data.dateOfBirth) : '',
      address: data.address.trim(),
      position: data.position.trim(),
      employment_type: data.employmentType,
      super_fund: superFund,
      emergency_contact_name: data.emergencyName.trim(),
      emergency_contact_phone: data.emergencyPhone.trim(),
      account_name: data.accountName.trim(),
      bsb: data.bsb,
      account_number: data.accountNumber,
      tfn: data.tfn,
      invite_id: data.inviteId ?? '',
    },
  });
  if (error) throw error;
  return row as { id: string; business_id: string };
}

/**
 * Saves the qualifications added during sign-up (files go to private storage
 * that only the employee and their owner can open). Returns the names of any that failed.
 */
export async function saveQualifications(employee: { id: string; businessId: string }, qualifications: SignupQualification[]) {
  const failed: string[] = [];
  for (const q of qualifications) {
    try {
      await addQualification(employee, { name: q.name, issueDate: null, expiryDate: q.expiryDate, document: q.file });
    } catch {
      failed.push(q.name);
    }
  }
  return failed;
}
