// People the owner has added on the Employees page who haven't signed up yet
// (shown as "Invited"). Stored online ("employee_invites" table, owner only).
// When the person signs up with the business code and the same email or phone
// (or their personal invite link), the database creates their employee profile
// with the role and pay entered here, and removes the invite.
import { Linking, Platform, Share } from 'react-native';

import { businessStore, inviteLink } from '@/data/business';
import type { PayType } from '@/data/employees';
import { createStore } from '@/data/store';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

export type EmployeeInvite = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  employmentType: string;
  payType: PayType;
  payRate: number | null;
  /** "YYYY-MM-DD" */
  startDate: string | null;
  createdAt: string;
};

type InviteRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  employment_type: string | null;
  pay_type: PayType;
  pay_rate: number | string | null;
  start_date: string | null;
  created_at: string;
};

function fromRow(row: InviteRow): EmployeeInvite {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: row.position ?? '',
    employmentType: row.employment_type ?? '',
    payType: row.pay_type,
    payRate: row.pay_rate === null ? null : Number(row.pay_rate),
    startDate: row.start_date,
    createdAt: row.created_at,
  };
}

function toColumns(invite: Omit<EmployeeInvite, 'id' | 'createdAt'>) {
  return {
    full_name: invite.fullName.trim(),
    email: invite.email.trim() || null,
    phone: invite.phone.trim() || null,
    position: invite.role.trim() || null,
    employment_type: invite.employmentType || null,
    pay_type: invite.payType,
    pay_rate: invite.payRate,
    start_date: invite.startDate,
  };
}

export const invitesStore = createStore<EmployeeInvite[]>([]);

export function useInvites() {
  return invitesStore.use();
}

export async function loadInvites() {
  const { data, error } = await supabase.from('employee_invites').select('*').order('created_at');
  if (error) throw error;
  invitesStore.set((data as InviteRow[]).map(fromRow));
}

/** Adds someone to the Employees list as "Invited". Returns the invite, or throws. */
export async function createInvite(invite: Omit<EmployeeInvite, 'id' | 'createdAt'>) {
  const businessId = businessStore.get()?.id;
  if (!businessId) throw new Error('Your business hasn’t loaded yet. Please try again.');
  const id = newId();
  const { data, error } = await supabase
    .from('employee_invites')
    .insert({ id, business_id: businessId, ...toColumns(invite) })
    .select('*')
    .single<InviteRow>();
  if (error) throw error;
  const saved = fromRow(data);
  invitesStore.set((all) => [...all, saved]);
  return saved;
}

export async function updateInvite(id: string, invite: Omit<EmployeeInvite, 'id' | 'createdAt'>) {
  const { error } = await supabase.from('employee_invites').update(toColumns(invite)).eq('id', id);
  if (error) throw error;
  invitesStore.set((all) => all.map((i) => (i.id === id ? { ...i, ...invite } : i)));
}

export async function deleteInvite(id: string) {
  const { error } = await supabase.from('employee_invites').delete().eq('id', id);
  if (error) throw error;
  invitesStore.set((all) => all.filter((i) => i.id !== id));
}

/** Personal link that opens sign-up with the code and their name/email filled in. */
export function personalInviteLink(code: string, inviteId: string) {
  return `${inviteLink(code)}?invite=${inviteId}`;
}

function inviteMessage(invite: EmployeeInvite | null) {
  const business = businessStore.get();
  const code = business?.inviteCode ?? '';
  const firstName = invite?.fullName.trim().split(/\s+/)[0];
  return [
    `${firstName ? `Hi ${firstName}, you've` : "You've"} been invited to join ${business?.businessName || 'our team'} on NexGain.`,
    '',
    `1. Download the NexGain app and choose "Employee", then "Sign up".`,
    `2. Enter the business code: ${code}`,
    '',
    `Or open this link on your phone: ${invite ? personalInviteLink(code, invite.id) : inviteLink(code)}`,
  ].join('\n');
}

/** Opens the phone's email app with the invite written out. */
export async function inviteByEmail(invite: EmployeeInvite) {
  const subject = `Join ${businessStore.get()?.businessName || 'our team'} on NexGain`;
  const url = `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(inviteMessage(invite))}`;
  await Linking.openURL(url);
}

/** Opens the phone's messages app with the invite written out. */
export async function inviteBySms(invite: EmployeeInvite) {
  const number = invite.phone.replace(/[^\d+]/g, '');
  // iOS uses "&body=", Android uses "?body=".
  const separator = Platform.OS === 'ios' ? '&' : '?';
  await Linking.openURL(`sms:${number}${separator}body=${encodeURIComponent(inviteMessage(invite))}`);
}

/** Opens the share sheet with the business code (or one person's invite). */
export async function shareInvite(invite: EmployeeInvite | null = null) {
  await Share.share({ message: inviteMessage(invite) });
}
