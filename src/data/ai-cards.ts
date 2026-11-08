// Result cards for things an AI insight is about (a job, an invoice, a client...),
// built from data the app has already loaded, or from the sample business in
// the preview. The chat's cards come ready-made from the server instead.
import { sampleSnapshotStore } from '@/data/ai-insights';
import { clientsStore } from '@/data/clients';
import { employeeFullName, employeesStore } from '@/data/employees';
import { displayStatus, docsStore, docTotals } from '@/data/invoices';
import { jobsStore } from '@/data/jobs';

import { buildCard } from '../../supabase/functions/_shared/ai/tools';
import type { CardType, ResultCard } from '../../supabase/functions/_shared/ai/types';

export type { ResultCard };

/** A card for one related item, or null if it can't be found (e.g. it was deleted). */
export function cardFor(type: CardType, id: string): ResultCard | null {
  const sample = sampleSnapshotStore.get();
  if (sample) return buildCard(sample, type, id);

  const clientName = (clientId: string | null) => clientsStore.get().find((c) => c.id === clientId)?.name ?? '';
  switch (type) {
    case 'job': {
      const j = jobsStore.get().find((x) => x.id === id);
      if (!j) return null;
      const quote = j.quoteId ? docsStore.get().find((d) => d.id === j.quoteId) : undefined;
      const people = employeesStore.get();
      return {
        type,
        id,
        title: j.title,
        reference: quote?.number ?? null,
        address: j.address,
        startsAt: j.startsAt,
        status: j.status,
        clientName: clientName(j.clientId),
        staffNames: j.assignedEmployeeIds.map((e) => {
          const person = people.find((p) => p.id === e);
          return person ? employeeFullName(person) : 'Former team member';
        }),
      };
    }
    case 'invoice': {
      const d = docsStore.get().find((x) => x.id === id);
      return d
        ? {
            type,
            id,
            number: d.number,
            clientName: d.client.name,
            total: docTotals(d.items, d.gstRate).total,
            dueDate: d.dueDate,
            status: displayStatus(d),
          }
        : null;
    }
    case 'client': {
      const c = clientsStore.get().find((x) => x.id === id);
      if (!c) return null;
      const unpaid = docsStore
        .get()
        .filter((d) => d.kind === 'invoice' && d.status === 'Pending' && (d.client.email === c.email || d.client.name === c.name))
        .reduce((sum, d) => sum + docTotals(d.items, d.gstRate).total, 0);
      return { type, id, name: c.name, email: c.email, phone: c.phone, address: c.address, unpaidTotal: Math.round(unpaid * 100) / 100 };
    }
    case 'team_member': {
      const e = employeesStore.get().find((x) => x.id === id);
      return e ? { type, id, name: employeeFullName(e), role: e.role, employmentType: e.employmentType, hoursThisWeek: null } : null;
    }
    // Bank transactions aren't loaded in the app yet (no Transactions page).
    case 'transaction':
    case 'insight':
      return null;
  }
}
