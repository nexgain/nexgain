import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';

import { Colors as C, Spacing } from '@/constants/theme';

/** Categorical series colours, validated for CVD separation and contrast on the dark card surface. */
export const SeriesColors = ['#3987e5', '#d95926', '#199e70', '#c98500'] as const;

export type Series = {
  name: string;
  color: string;
  values: number[];
};

const PAD = { top: 10, right: 8, bottom: 24, left: 48 };

function niceCeil(value: number) {
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

function useScale(series: Series[]) {
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const hasData = max > 0;
  const yMax = hasData ? niceCeil(max) : 1;
  return { hasData, yMax, ticks: [0, yMax / 2, yMax] };
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.name} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <Text style={styles.legendText}>{item.name}</Text>
        </View>
      ))}
    </View>
  );
}

/** Shared frame: measures width, draws grid + axis labels, and handles tap/hover per category. */
function ChartFrame({
  categories,
  series,
  height,
  formatValue,
  emptyMessage,
  renderMarks,
}: {
  categories: string[];
  series: Series[];
  height: number;
  formatValue: (value: number) => string;
  emptyMessage: string;
  renderMarks: (args: {
    x: (index: number) => number;
    y: (value: number) => number;
    band: number;
    selected: number | null;
  }) => React.ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const { hasData, yMax, ticks } = useScale(series);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = categories.length ? plotW / categories.length : 0;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const tooltip =
    hasData && selected !== null
      ? `${categories[selected]} · ${series
          .map((s) => `${series.length > 1 ? `${s.name} ` : ''}${formatValue(s.values[selected] ?? 0)}`)
          .join(' · ')}`
      : null;

  return (
    <View>
      {series.length > 1 && <Legend items={series} />}
      <Text style={styles.tooltip}>{tooltip ?? ' '}</Text>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {ticks.map((tick) => (
              <G key={tick}>
                <Line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={C.border}
                  strokeWidth={1}
                />
                {(hasData || tick === 0) && (
                  <SvgText
                    x={PAD.left - 8}
                    y={y(tick) + 4}
                    fontSize={11}
                    fill={C.textSecondary}
                    textAnchor="end">
                    {formatValue(tick)}
                  </SvgText>
                )}
              </G>
            ))}
            {categories.map((label, i) => (
              <SvgText
                key={label}
                x={x(i)}
                y={height - 6}
                fontSize={11}
                fill={selected === i ? C.text : C.textSecondary}
                textAnchor="middle">
                {label}
              </SvgText>
            ))}
            {hasData && renderMarks({ x, y, band, selected })}
          </Svg>
        )}
        {!hasData && (
          <View style={[styles.emptyOverlay, { left: PAD.left, bottom: PAD.bottom, top: PAD.top }]}>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        )}
        {hasData &&
          categories.map((label, i) => (
            <Pressable
              key={label}
              accessibilityLabel={label}
              onPress={() => setSelected(selected === i ? null : i)}
              onHoverIn={() => setSelected(i)}
              onHoverOut={() => setSelected(null)}
              style={[styles.hitArea, { left: PAD.left + band * i, width: band, height }]}
            />
          ))}
      </View>
    </View>
  );
}

function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + w - radius} Q${x + w},${y} ${x + w},${y + radius} V${y + h} Z`;
}

/** Grouped bar chart. With no data it keeps its axis and labels and shows an empty message. */
export function BarChart({
  categories,
  series,
  height = 200,
  formatValue,
  emptyMessage = 'No data yet',
}: {
  categories: string[];
  series: Series[];
  height?: number;
  formatValue: (value: number) => string;
  emptyMessage?: string;
}) {
  return (
    <ChartFrame
      categories={categories}
      series={series}
      height={height}
      formatValue={formatValue}
      emptyMessage={emptyMessage}
      renderMarks={({ x, y, band, selected }) => {
        const gap = 2;
        const barW = Math.min(28, (band * 0.6 - gap * (series.length - 1)) / series.length);
        const groupW = barW * series.length + gap * (series.length - 1);
        return categories.map((_, i) =>
          series.map((s, si) => {
            const value = s.values[i] ?? 0;
            if (value <= 0) return null;
            const left = x(i) - groupW / 2 + si * (barW + gap);
            const top = y(value);
            return (
              <Path
                key={`${i}-${s.name}`}
                d={roundedTopBar(left, top, barW, y(0) - top, 4)}
                fill={s.color}
                opacity={selected === null || selected === i ? 1 : 0.45}
              />
            );
          }),
        );
      }}
    />
  );
}

/** Line chart with markers and a crosshair on the selected category. */
export function LineChart({
  categories,
  series,
  height = 200,
  formatValue,
  emptyMessage = 'No data yet',
}: {
  categories: string[];
  series: Series[];
  height?: number;
  formatValue: (value: number) => string;
  emptyMessage?: string;
}) {
  return (
    <ChartFrame
      categories={categories}
      series={series}
      height={height}
      formatValue={formatValue}
      emptyMessage={emptyMessage}
      renderMarks={({ x, y, selected }) => (
        <G>
          {selected !== null && (
            <Line
              x1={x(selected)}
              x2={x(selected)}
              y1={PAD.top}
              y2={y(0)}
              stroke={C.textSecondary}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
          {series.map((s) => (
            <G key={s.name}>
              <Polyline
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {s.values.map((v, i) => (
                <Circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={4}
                  fill={s.color}
                  stroke={C.surface}
                  strokeWidth={2}
                />
              ))}
            </G>
          ))}
        </G>
      )}
    />
  );
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const point = (angle: number) => [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
  const [sx, sy] = point(start);
  const [ex, ey] = point(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M${sx},${sy} A${r},${r} 0 ${large} 1 ${ex},${ey}`;
}

/** Donut chart with a legend. With no data it draws an empty ring. */
export function DonutChart({
  segments,
  formatValue,
  size = 160,
  emptyMessage = 'No data yet',
}: {
  segments: { name: string; color: string; value: number }[];
  formatValue: (value: number) => string;
  size?: number;
  emptyMessage?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const gapAngle = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 0.03 : 0;

  const visible = segments.filter((s) => s.value > 0);
  const arcs = visible.map((s, i) => {
    const before = visible.slice(0, i).reduce((sum, p) => sum + p.value, 0);
    const start = (before / total) * Math.PI * 2;
    const end = ((before + s.value) / total) * Math.PI * 2;
    return { ...s, start: start + gapAngle / 2, end: end - gapAngle / 2 };
  });

  return (
    <View style={styles.donutWrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {total === 0 ? (
            <Circle cx={c} cy={c} r={r} stroke={C.surfaceRaised} strokeWidth={stroke} fill="none" />
          ) : arcs.length === 1 ? (
            <Circle cx={c} cy={c} r={r} stroke={arcs[0].color} strokeWidth={stroke} fill="none" />
          ) : (
            arcs.map((a) => (
              <Path
                key={a.name}
                d={arcPath(c, c, r, a.start, a.end)}
                stroke={a.color}
                strokeWidth={stroke}
                fill="none"
              />
            ))
          )}
        </Svg>
        <View style={styles.donutCenter}>
          <Text style={total === 0 ? styles.emptyText : styles.donutTotal}>
            {total === 0 ? emptyMessage : formatValue(total)}
          </Text>
        </View>
      </View>
      {total > 0 && (
        <View style={styles.donutLegend}>
          {segments.map((s) => (
            <View key={s.name} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>
                {s.name} · {formatValue(s.value)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three - 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    color: C.textSecondary,
    fontSize: 12,
  },
  tooltip: {
    color: C.text,
    fontSize: 12,
    marginTop: Spacing.two,
    minHeight: 16,
  },
  emptyOverlay: {
    position: 'absolute',
    right: PAD.right,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: C.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  hitArea: {
    position: 'absolute',
    top: 0,
  },
  donutWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  donutCenter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  donutTotal: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  donutLegend: {
    gap: Spacing.two,
  },
});
