import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { FieldButton, OptionSheet, TextField } from '@/components/owner/form';
import { JobCard } from '@/components/owner/jobs-ui';
import { Card, EmptyState, goBack, OwnerIcons, OwnerScreen, PageHeader, TabRow } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { addDaysKey, todayKey } from '@/data/business-time';
import { useClients } from '@/data/clients';
import { useCurrentEmployee } from '@/data/current-employee';
import { useEmployees } from '@/data/employees';
import { JOB_STATUS_LABEL, JOB_STATUSES, useJobs, type Job, type JobStatus } from '@/data/jobs';

const STATUS_TABS = ['All', ...JOB_STATUSES.map((s) => JOB_STATUS_LABEL[s])] as const;
const DATE_FILTERS = ['Any date', 'Today', 'Next 7 days', 'Upcoming', 'Past'] as const;
type DateFilter = (typeof DATE_FILTERS)[number];
const ALL_CLIENTS = 'All clients';

function matchesDate(job: Job, filter: DateFilter, today: string) {
  if (filter === 'Today') return job.date === today;
  if (filter === 'Next 7 days') return job.date >= today && job.date < addDaysKey(today, 7);
  if (filter === 'Upcoming') return job.date >= today;
  if (filter === 'Past') return job.date < today;
  return true;
}

// Every confirmed job (booked from an accepted quote). Owner only.
export default function JobsScreen() {
  const me = useCurrentEmployee();
  const jobs = useJobs();
  const clients = useClients();
  const employees = useEmployees();
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>('All');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('Any date');
  const [client, setClient] = useState(ALL_CLIENTS);
  const [sheet, setSheet] = useState<'date' | 'client' | null>(null);

  if (me) return <Redirect href="/home" />;

  const clientName = (job: Job) => clients.find((c) => c.id === job.clientId)?.name ?? '';
  const today = todayKey();
  const q = search.trim().toLowerCase();
  const count = (s: JobStatus) => jobs.filter((j) => j.status === s).length;

  const visible = jobs
    .filter((j) => status === 'All' || JOB_STATUS_LABEL[j.status] === status)
    .filter((j) => matchesDate(j, dateFilter, today))
    .filter((j) => client === ALL_CLIENTS || clientName(j) === client)
    .filter((j) => !q || `${clientName(j)} ${j.title} ${j.address} ${j.description}`.toLowerCase().includes(q))
    // Soonest first; past jobs (when shown) newest first after upcoming ones.
    .sort((a, b) =>
      a.date >= today && b.date >= today
        ? a.startsAt.localeCompare(b.startsAt)
        : a.date >= today
          ? -1
          : b.date >= today
            ? 1
            : b.startsAt.localeCompare(a.startsAt),
    );

  const clientNames = [ALL_CLIENTS, ...[...new Set(clients.map((c) => c.name).filter(Boolean))].sort()];

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack()} title="Jobs" subtitle="Every confirmed job, from booking to completion." />

      <TextField
        value={search}
        onChangeText={setSearch}
        placeholder="Search client, address or job"
        accessibilityLabel="Search jobs"
        autoCorrect={false}
      />
      <View style={styles.filters}>
        <View style={styles.flex}>
          <FieldButton value={dateFilter} icon={OwnerIcons.calendar} onPress={() => setSheet('date')} accessibilityLabel="Date filter" />
        </View>
        <View style={styles.flex}>
          <FieldButton value={client} icon={OwnerIcons.people} onPress={() => setSheet('client')} accessibilityLabel="Client filter" />
        </View>
      </View>
      <TabRow
        tabs={STATUS_TABS.map((t) => (t === 'All' ? `All (${jobs.length})` : `${t} (${count(JOB_STATUSES[STATUS_TABS.indexOf(t) - 1])})`))}
        active={status === 'All' ? `All (${jobs.length})` : `${status} (${count(JOB_STATUSES[STATUS_TABS.indexOf(status) - 1])})`}
        onChange={(tab) => setStatus(tab.replace(/ \(\d+\)$/, '') as (typeof STATUS_TABS)[number])}
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={OwnerIcons.receipt}
            message={
              jobs.length === 0
                ? 'No jobs yet. When a quote is accepted, open it in Invoices & Quotes and tap "Confirm Job" to book it in.'
                : 'No jobs match these filters.'
            }
          />
        </Card>
      ) : (
        <View style={styles.list}>
          <Text style={styles.muted}>
            {visible.length} job{visible.length === 1 ? '' : 's'}
          </Text>
          {visible.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              clientName={clientName(job)}
              employees={employees}
              onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
            />
          ))}
        </View>
      )}

      <OptionSheet
        visible={sheet === 'date'}
        title="Date"
        options={DATE_FILTERS}
        value={dateFilter}
        onSelect={setDateFilter}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'client'}
        title="Client"
        options={clientNames}
        value={client}
        onSelect={setClient}
        onClose={() => setSheet(null)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  filters: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three - 4,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
});
