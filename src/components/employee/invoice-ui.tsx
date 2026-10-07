import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { INVOICE_STATUS_LABEL, loadContractorInvoices, type InvoiceStatus } from '@/data/contractor-invoices';

const STATUS_COLORS: Record<InvoiceStatus, { text: string; background: string }> = {
  draft: { text: C.textSecondary, background: '#EEF1F5' },
  sent: { text: C.primary, background: C.primarySoft },
  approved: { text: '#7C3AED', background: '#F1EBFE' },
  declined: { text: C.danger, background: C.dangerSoft },
  paid: { text: C.success, background: C.successSoft },
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  const colors = STATUS_COLORS[status];
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <Text style={[styles.pillText, { color: colors.text }]}>{INVOICE_STATUS_LABEL[status]}</Text>
    </View>
  );
}

/** Loads the contractor's invoices when a screen opens, with loading and error states. */
export function useInvoicesLoader() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const reload = useCallback(() => {
    setState('loading');
    loadContractorInvoices()
      .then(() => setState('ready'))
      .catch(() => setState('error'));
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadContractorInvoices()
      .then(() => !cancelled && setState('ready'))
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, []);
  return { state, reload };
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
