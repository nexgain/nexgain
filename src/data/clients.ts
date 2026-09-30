// The owner's clients, created automatically when a quote is confirmed as a
// job (one record per client, matched by email). Owner only.
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
};

export const clientsStore = createStore<ClientRecord[]>([]);

export function useClients() {
  return clientsStore.use();
}

export async function loadClients() {
  const { data, error } = await supabase.from('clients').select('id, name, email, phone, address').order('name');
  if (error) throw error;
  clientsStore.set(data as ClientRecord[]);
}
