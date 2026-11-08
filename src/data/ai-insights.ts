// AI insights: what the business health check found (saved by the "ai-insights"
// Edge Function into the ai_insights table). Read by the Dashboard's AI cards,
// the Analytics page's AI Insights card and the AI Assistant screen. Owner only.
//
// In development there's also a sample preview (see previewSampleInsights):
// it runs the same health check on made-up data and shows the results on
// screen only. Nothing sample is ever saved.
import { buildSampleSnapshot } from '@/data/ai-sample-data';
import { functionError } from '@/data/connected-accounts';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

import { runHealthCheck } from '../../supabase/functions/_shared/ai/insights';
import type {
  BusinessSnapshot,
  CardType,
  Insight,
  InsightArea,
  Placement,
  Severity,
} from '../../supabase/functions/_shared/ai/types';

export type { Placement, Severity };

export type AiInsight = {
  id: string;
  key: string;
  check: string;
  area: InsightArea;
  severity: Severity;
  placements: Placement[];
  title: string;
  summary: string;
  suggestion: string;
  estimatedSaving: number | null;
  related: { type: CardType; id: string }[];
  metrics: Record<string, number | string | null>;
  firstSeenAt: string;
  /** Made-up preview data (development only). */
  sample: boolean;
};

type InsightRow = {
  id: string;
  key: string;
  check_name: string;
  area: InsightArea;
  severity: Severity;
  placements: Placement[] | null;
  title: string;
  summary: string;
  suggestion: string;
  estimated_saving: number | string | null;
  related: { type: CardType; id: string }[] | null;
  metrics: Record<string, number | string | null> | null;
  first_seen_at: string;
};

const fromRow = (r: InsightRow): AiInsight => ({
  id: r.id,
  key: r.key,
  check: r.check_name,
  area: r.area,
  severity: r.severity,
  placements: r.placements ?? [],
  title: r.title,
  summary: r.summary,
  suggestion: r.suggestion,
  estimatedSaving: r.estimated_saving === null ? null : Number(r.estimated_saving),
  related: r.related ?? [],
  metrics: r.metrics ?? {},
  firstSeenAt: r.first_seen_at,
  sample: false,
});

const fromEngine = (i: Insight, at: string): AiInsight => ({
  id: `sample:${i.key}`,
  key: i.key,
  check: i.check,
  area: i.area,
  severity: i.severity,
  placements: i.placements,
  title: i.title,
  summary: i.summary,
  suggestion: i.suggestion,
  estimatedSaving: i.estimatedSaving,
  related: i.related,
  metrics: i.metrics,
  firstSeenAt: at,
  sample: true,
});

export const aiInsightsStore = createStore<AiInsight[]>([]);

/** The sample business shown by the preview (null when showing real data). */
export const sampleSnapshotStore = createStore<BusinessSnapshot | null>(null);

export function useAiInsights() {
  return aiInsightsStore.use();
}

export function useSampleSnapshot() {
  return sampleSnapshotStore.use();
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Insights for one place on screen, most urgent first. */
export function insightsFor(all: AiInsight[], placement: Placement) {
  return all
    .filter((i) => i.placements.includes(placement))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (b.estimatedSaving ?? 0) - (a.estimatedSaving ?? 0));
}

/** Active insights for the owner's business (dismissed and resolved ones are left out). */
export async function loadAiInsights() {
  if (sampleSnapshotStore.get()) return; // the preview stays on screen until it's closed
  const { data, error } = await supabase.from('ai_insights').select('*').eq('status', 'active');
  if (error) throw error;
  aiInsightsStore.set((data as InsightRow[]).map(fromRow));
}

/** Runs the health check now (instead of waiting for the morning) and reloads. Returns an error message or null. */
export async function refreshAiInsights(): Promise<string | null> {
  if (sampleSnapshotStore.get()) {
    previewSampleInsights();
    return null;
  }
  const { error } = await supabase.functions.invoke('ai-insights', { body: {} });
  if (error) return (await functionError(error, "The health check couldn't run. Please try again.")).message;
  await loadAiInsights().catch(() => {});
  return null;
}

/** Hides an insight (it stays hidden while the problem lasts). */
export async function dismissAiInsight(id: string) {
  const before = aiInsightsStore.get();
  aiInsightsStore.set(before.filter((i) => i.id !== id));
  if (id.startsWith('sample:')) return true;
  const { error } = await supabase.from('ai_insights').update({ status: 'dismissed' }).eq('id', id);
  if (error) {
    console.warn('Could not hide insight:', error.message);
    aiInsightsStore.set(before);
    return false;
  }
  return true;
}

/**
 * Development only: shows what the health check finds for a made-up business
 * (overdue invoices, an unstaffed job, messy bank names, a materials price rise...)
 * on the Dashboard, Analytics page and AI Assistant. Screen only, never saved.
 */
export function previewSampleInsights() {
  const now = new Date();
  const snapshot = buildSampleSnapshot(now);
  sampleSnapshotStore.set(snapshot);
  aiInsightsStore.set(runHealthCheck(snapshot, now).map((i) => fromEngine(i, now.toISOString())));
}

/** Leaves the sample preview and shows the real insights again. */
export async function closeSamplePreview() {
  sampleSnapshotStore.set(null);
  aiInsightsStore.set([]);
  await loadAiInsights().catch(() => {});
}

export function clearAiInsights() {
  sampleSnapshotStore.set(null);
  aiInsightsStore.set([]);
}
