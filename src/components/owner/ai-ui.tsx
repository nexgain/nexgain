import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, EmptyState, Icon, OwnerIcons, type IconName } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { cardFor, type ResultCard } from '@/data/ai-cards';
import { dismissAiInsight, insightsFor, useAiInsights, useSampleSnapshot, type AiInsight, type Placement } from '@/data/ai-insights';
import { formatShortDate } from '@/data/employee-roster';
import { JOB_STATUS_LABEL, type JobStatus } from '@/data/jobs';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

/** The app's accent colour, and its soft background (the same as an "info" badge). */
export const AI_ACCENT = C.accent;
export const AI_ACCENT_SOFT = 'rgba(79, 140, 255, 0.14)';

const SEVERITY: Record<AiInsight['severity'], { label: string; tone: 'danger' | 'warning' | 'info' }> = {
  high: { label: 'Urgent', tone: 'danger' },
  medium: { label: 'Needs attention', tone: 'warning' },
  low: { label: 'Tip', tone: 'info' },
};

// ---------------------------------------------------------------------------
// Insights list (inside the existing AI cards, and on the AI Assistant screen)
// ---------------------------------------------------------------------------

/**
 * The AI's insights for one place on screen. Shows `empty` (the card's
 * existing "no insights" message) when there are none.
 */
export function AiInsightsList({
  placement,
  empty,
  emptyIcon = OwnerIcons.sparkles,
  limit = 3,
}: {
  placement: Placement;
  empty: string;
  emptyIcon?: IconName;
  limit?: number;
}) {
  const insights = insightsFor(useAiInsights(), placement);
  const sample = useSampleSnapshot() !== null;
  const [showAll, setShowAll] = useState(false);

  if (insights.length === 0) return <EmptyState icon={emptyIcon} message={empty} />;
  const shown = showAll ? insights : insights.slice(0, limit);
  return (
    <View style={styles.list}>
      {sample && <SampleNote />}
      {shown.map((i, n) => (
        <InsightRow key={i.id} insight={i} divider={n > 0} />
      ))}
      {insights.length > limit && (
        <Button
          label={showAll ? 'Show fewer' : `See all ${insights.length}`}
          variant="secondary"
          onPress={() => setShowAll(!showAll)}
        />
      )}
    </View>
  );
}

export function SampleNote() {
  return (
    <View style={styles.sampleNote}>
      <Icon name={OwnerIcons.info} color={AI_ACCENT} size={14} />
      <Text style={styles.sampleText}>Sample data preview. Not your real business, and nothing is saved.</Text>
    </View>
  );
}

function InsightRow({ insight: i, divider }: { insight: AiInsight; divider: boolean }) {
  const [open, setOpen] = useState(false);
  const severity = SEVERITY[i.severity];
  const cards = i.related.map((r) => cardFor(r.type, r.id)).filter((c): c is ResultCard => c !== null);
  return (
    <View style={[styles.insight, divider && styles.divider]}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${severity.label}: ${i.title}`}
        style={({ pressed }) => [styles.insightTop, pressed && styles.pressed]}>
        <View style={[styles.dot, { backgroundColor: i.severity === 'high' ? C.danger : i.severity === 'medium' ? C.warning : C.accent }]} />
        <View style={styles.flex}>
          <Text style={styles.insightTitle}>{i.title}</Text>
          <Text style={styles.insightSummary} numberOfLines={open ? undefined : 2}>
            {i.summary}
          </Text>
        </View>
        <Icon name={OwnerIcons.chevronDown} color={C.textSecondary} size={12} />
      </Pressable>

      <View style={styles.badges}>
        <Badge label={severity.label} tone={severity.tone} />
        {i.estimatedSaving ? <Badge label={`Est. ${formatMoney(i.estimatedSaving, { cents: false })}`} tone="success" /> : null}
      </View>

      {open && (
        <View style={styles.insightMore}>
          <View style={styles.fix}>
            <Icon name={OwnerIcons.lightbulb} color={AI_ACCENT} size={14} />
            <Text style={styles.fixText}>{i.suggestion}</Text>
          </View>
          {cards.map((c) => (
            <ResultCardView key={`${c.type}:${c.id}`} card={c} />
          ))}
          <View style={styles.actions}>
            <Button
              label="Ask AI about this"
              icon={OwnerIcons.sparkles}
              variant="secondary"
              onPress={() => router.navigate({ pathname: '/ai-assistant', params: { ask: `Tell me more about this: ${i.title}` } })}
            />
            <Button label="Hide" variant="secondary" onPress={() => dismissAiInsight(i.id)} />
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Result cards (under AI answers and inside insights)
// ---------------------------------------------------------------------------

const CARD_ICONS: Record<ResultCard['type'], IconName> = {
  job: OwnerIcons.calendar,
  invoice: OwnerIcons.receipt,
  client: OwnerIcons.people,
  team_member: { ios: 'person.fill', android: 'person', web: 'person' },
  transaction: OwnerIcons.card,
  insight: OwnerIcons.lightbulb,
};

/** Business-time date of a timestamp, e.g. "Wed 11 Nov · 8:00 am". */
function whenText(iso: string) {
  const d = new Date(new Date(iso).getTime() + 10 * 3600_000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const date = formatShortDate(fromDateKey(d.toISOString().slice(0, 10)));
  return `${date} · ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** One card with real details and buttons that open the real screens. */
export function ResultCardView({ card }: { card: ResultCard }) {
  // Sample cards point at made-up records, so their buttons don't open anything.
  const sample = useSampleSnapshot() !== null || card.id.startsWith('sample');
  const go = (href: Href) => (sample ? undefined : () => router.navigate(href));

  let title = '';
  let lines: string[] = [];
  let status: { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } | null = null;
  let buttons: { label: string; onPress?: () => void }[] = [];

  switch (card.type) {
    case 'job':
      title = card.reference ? `${card.title} · ${card.reference}` : card.title;
      lines = [whenText(card.startsAt), card.address, card.clientName, card.staffNames.length ? `Staff: ${card.staffNames.join(', ')}` : 'No staff assigned'].filter(Boolean);
      status = {
        label: JOB_STATUS_LABEL[card.status as JobStatus] ?? card.status,
        tone: card.status === 'completed' ? 'success' : card.status === 'cancelled' ? 'neutral' : card.staffNames.length ? 'info' : 'warning',
      };
      buttons = [
        { label: 'View Job', onPress: go({ pathname: '/job/[id]', params: { id: card.id } }) },
        {
          label: 'View in Calendar',
          onPress: go({ pathname: '/calendar', params: { date: new Date(new Date(card.startsAt).getTime() + 10 * 3600_000).toISOString().slice(0, 10) } }),
        },
      ];
      break;
    case 'invoice':
      title = `${card.number} · ${formatMoney(card.total)}`;
      lines = [card.clientName, card.dueDate ? `Due ${formatShortDate(fromDateKey(card.dueDate))}` : ''].filter(Boolean);
      status = { label: card.status, tone: card.status === 'Overdue' ? 'danger' : card.status === 'Paid' ? 'success' : 'info' };
      buttons = [{ label: card.number.startsWith('Q') ? 'View Quote' : 'View Invoice', onPress: go({ pathname: '/invoices/[id]', params: { id: card.id } }) }];
      break;
    case 'client':
      title = card.name;
      lines = [card.address, [card.phone, card.email].filter(Boolean).join(' · '), card.unpaidTotal > 0 ? `${formatMoney(card.unpaidTotal)} unpaid` : ''].filter(Boolean);
      buttons = [
        ...(card.phone ? [{ label: 'Call', onPress: sample ? undefined : () => Linking.openURL(`tel:${card.phone.replace(/[^\d+]/g, '')}`) }] : []),
        ...(card.email ? [{ label: 'Email', onPress: sample ? undefined : () => Linking.openURL(`mailto:${card.email}`) }] : []),
      ];
      break;
    case 'team_member':
      title = card.name;
      lines = [[card.role, card.employmentType].filter(Boolean).join(' · '), card.hoursThisWeek !== null ? `${card.hoursThisWeek} hours rostered this week` : ''].filter(Boolean);
      buttons = [{ label: 'View Profile', onPress: go({ pathname: '/employee/[id]', params: { id: card.id } }) }];
      break;
    case 'transaction':
      title = `${card.merchant} · ${formatMoney(card.amount)}`;
      lines = [formatShortDate(fromDateKey(card.date)), card.rawMerchant, card.category ?? ''].filter(Boolean);
      buttons = card.jobId ? [{ label: 'View Job', onPress: go({ pathname: '/job/[id]', params: { id: card.jobId } }) }] : [];
      break;
    case 'insight':
      title = card.title;
      lines = [card.summary];
      status = { label: SEVERITY[card.severity].label, tone: SEVERITY[card.severity].tone };
      break;
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardIcon}>
          <Icon name={CARD_ICONS[card.type]} color={AI_ACCENT} size={16} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{title}</Text>
          {lines.map((l) => (
            <Text key={l} style={styles.cardLine}>
              {l}
            </Text>
          ))}
        </View>
        {status && <Badge label={status.label} tone={status.tone} />}
      </View>
      {buttons.length > 0 && (
        <View style={styles.actions}>
          {buttons.map((b, n) => (
            <Button key={b.label} label={b.label} variant={n === 0 ? 'primary' : 'secondary'} disabled={!b.onPress} onPress={b.onPress} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  list: {
    gap: Spacing.two,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: Spacing.three - 4,
  },
  sampleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium - 4,
    backgroundColor: AI_ACCENT_SOFT,
  },
  sampleText: {
    flex: 1,
    color: C.text,
    fontSize: 12,
  },
  insight: {
    gap: Spacing.two,
  },
  insightTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  insightTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  insightSummary: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginLeft: Spacing.three + 2,
  },
  insightMore: {
    gap: Spacing.two + 2,
    marginLeft: Spacing.three + 2,
  },
  fix: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    backgroundColor: AI_ACCENT_SOFT,
  },
  fixText: {
    flex: 1,
    color: C.text,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.medium - 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AI_ACCENT_SOFT,
  },
  cardTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cardLine: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
});
