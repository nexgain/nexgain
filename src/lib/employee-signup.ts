// Employee sign-up: find the business by invite code, then create the employee
// profile in that business. Bank details and TFN are sent once, over HTTPS, and
// stored encrypted by the database; they're never logged or kept in the app.
import type { EmployeeSignupData, FoundBusiness, PickedDocument } from '@/components/employee-signup/types';
import { supabase } from '@/lib/supabase';

export async function findBusinessByCode(code: string): Promise<FoundBusiness | null> {
  const { data, error } = await supabase.rpc('find_business_by_code', { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  const row = (data as { id: string; name: string; logo: string | null; industry: string | null; industry_category: string | null }[])[0];
  return row ? { id: row.id, name: row.name, logo: row.logo, industry: row.industry, industryCategory: row.industry_category } : null;
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
    },
  });
  if (error) throw error;
  return row as { id: string; business_id: string };
}

/**
 * Uploads the employee's documents to private storage (only they and their owner
 * can open them). Returns the names of any that failed.
 */
export async function uploadDocuments(businessId: string, employeeId: string, documents: Partial<Record<string, PickedDocument>>) {
  const failed: string[] = [];
  for (const [kind, doc] of Object.entries(documents)) {
    if (!doc) continue;
    try {
      const body = await (await fetch(doc.uri)).arrayBuffer();
      const safeName = doc.name.replace(/[^A-Za-z0-9._-]+/g, '_');
      const path = `${businessId}/${employeeId}/${Date.now()}-${safeName}`;
      const upload = await supabase.storage.from('employee-documents').upload(path, body, { contentType: doc.mimeType || undefined });
      if (upload.error) throw upload.error;
      const record = await supabase.from('employee_documents').insert({
        employee_id: employeeId,
        business_id: businessId,
        kind,
        file_name: doc.name,
        storage_path: path,
      });
      if (record.error) throw record.error;
    } catch {
      failed.push(kind);
    }
  }
  return failed;
}
