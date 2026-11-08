import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type TextInputInstance } from 'react-native';

import { AI_ACCENT, AI_ACCENT_SOFT, AiInsightsList, ResultCardView, SampleNote } from '@/components/owner/ai-ui';
import { Button, Card, Icon, OwnerIcons, OwnerScreen, ownerStyles, PageHeader, type IconName } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { askAssistant, newChat, retryLast, useAiChat, type ChatMessage } from '@/data/ai-chat';
import { closeSamplePreview, previewSampleInsights, refreshAiInsights, useSampleSnapshot } from '@/data/ai-insights';

const SUGGESTIONS: { label: string; question: string; icon: IconName }[] = [
  { label: 'Find this job', question: 'Find my next job', icon: OwnerIcons.calendar },
  { label: 'Find a transaction', question: 'Find my most recent transactions', icon: OwnerIcons.card },
  { label: 'Which invoices are overdue?', question: 'Which invoices are overdue?', icon: OwnerIcons.receipt },
  { label: 'Have material costs increased?', question: 'Have material costs increased?', icon: OwnerIcons.trendingUp },
];

// The owner's AI Assistant: ask anything about the business, see what needs
// attention, and tap through to the real jobs, invoices and people.
export default function AiAssistantScreen() {
  const chat = useAiChat();
  const sample = useSampleSnapshot() !== null;
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // "Ask AI about this" on an insight opens this screen with a question ready to send.
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const navigation = useNavigation();
  useEffect(() => {
    if (!ask) return;
    askAssistant(ask);
    navigation.setParams({ ask: undefined } as never);
  }, [ask, navigation]);

  // New answers scroll into view.
  const count = chat.messages.length;
  useEffect(() => {
    if (count > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }, [count, chat.sending]);

  function send(question = text) {
    if (!question.trim() || chat.sending) return;
    askAssistant(question);
    setText('');
    setHint(null);
  }

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    setRefreshError(await refreshAiInsights());
    setRefreshing(false);
  }

  return (
    <OwnerScreen scrollRef={scrollRef}>
      <PageHeader
        title="AI Assistant"
        subtitle="Ask anything about your business"
        right={chat.messages.length > 0 ? <Button label="New chat" variant="secondary" onPress={newChat} /> : undefined}
      />

      <Card title="Ask NexGain AI" icon={OwnerIcons.sparkles}>
        <View style={styles.inputBox}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Ask anything about your business"
            placeholderTextColor={C.textSecondary}
            multiline
            maxLength={4000}
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => send()}
            accessibilityLabel="Ask anything about your business"
            style={styles.input}
          />
          <Pressable
            onPress={() => {
              // Speech-to-text uses the keyboard's own microphone (works in Expo Go, nothing to install).
              inputRef.current?.focus();
              setHint('Tap the microphone on your keyboard and speak your question.');
            }}
            accessibilityRole="button"
            accessibilityLabel="Speak your question"
            hitSlop={6}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Icon name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }} color={C.textSecondary} size={18} />
          </Pressable>
          <Pressable
            onPress={() => send()}
            disabled={!text.trim() || chat.sending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [styles.sendButton, (!text.trim() || chat.sending) && styles.disabled, pressed && styles.pressed]}>
            <Icon name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} color="#FFFFFF" size={18} />
          </Pressable>
        </View>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </Card>

      <Card
        title="Things that need your attention"
        icon={OwnerIcons.bell}
        right={
          <Pressable onPress={refresh} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Run the health check now" hitSlop={8}>
            {refreshing ? (
              <ActivityIndicator color={C.accent} size="small" />
            ) : (
              <Icon name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} color={C.accent} size={16} />
            )}
          </Pressable>
        }>
        <AiInsightsList
          placement="attention"
          empty="Nothing needs your attention right now. NexGain checks your business every morning."
          emptyIcon={OwnerIcons.check}
        />
        {refreshError && <Text style={styles.error}>{refreshError}</Text>}
        {__DEV__ && (
          // Development only: see the insights with made-up data (never saved).
          <Button
            label={sample ? 'Close sample preview' : 'Preview with sample data'}
            variant="secondary"
            onPress={sample ? closeSamplePreview : previewSampleInsights}
          />
        )}
      </Card>

      {chat.messages.length === 0 && (
        <View style={styles.suggestions}>
          <Text style={styles.sectionTitle}>Try asking...</Text>
          <View style={styles.grid}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s.label}
                onPress={() => send(s.question)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <View style={styles.chipIcon}>
                  <Icon name={s.icon} color={AI_ACCENT} size={16} />
                </View>
                <Text style={styles.chipText}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {chat.messages.length > 0 && (
        <View style={styles.thread}>
          {sample && <SampleNote />}
          {chat.messages.map((m) => (
            <Message key={m.id} message={m} onRetry={retryLast} />
          ))}
          {chat.sending && (
            <View style={styles.aiRow}>
              <Avatar />
              <View style={[styles.aiBubble, styles.thinking]}>
                <ActivityIndicator color={AI_ACCENT} size="small" />
                <Text style={styles.aiText}>Looking into it…</Text>
              </View>
            </View>
          )}
          <Text style={ownerStyles.mutedText}>
            The AI only uses your NexGain data. Check anything important before acting on it.
          </Text>
        </View>
      )}
    </OwnerScreen>
  );
}

function Avatar() {
  return (
    <View style={styles.avatar}>
      <Image source={require('@/assets/nexgain-logo.png')} style={styles.avatarImage} contentFit="contain" accessibilityLabel="NexGain AI" />
    </View>
  );
}

function Message({ message: m, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  if (m.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{m.text}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.aiRow}>
      <Avatar />
      <View style={styles.aiContent}>
        <View style={[styles.aiBubble, m.failed && styles.failedBubble]}>
          <Text style={[styles.aiText, m.failed && styles.failedText]} selectable>
            {m.text}
          </Text>
        </View>
        {m.cards.map((c) => (
          <ResultCardView key={`${c.type}:${c.id}`} card={c} />
        ))}
        {m.failed && <Button label="Try again" variant="secondary" onPress={onRetry} />}
      </View>
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
  disabled: {
    opacity: 0.45,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingTop: 8,
    paddingBottom: 8,
    color: C.text,
    fontSize: 16,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  hint: {
    color: C.textSecondary,
    fontSize: 13,
  },
  error: {
    color: C.warning,
    fontSize: 13,
  },
  suggestions: {
    gap: Spacing.three - 4,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three - 4,
  },
  chip: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 76,
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  chipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AI_ACCENT_SOFT,
  },
  chipText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  thread: {
    gap: Spacing.three - 4,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  userBubble: {
    maxWidth: '85%',
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 18,
    borderBottomRightRadius: 6,
    backgroundColor: C.accent,
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceRaised,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatarImage: {
    width: 24,
    height: 24,
  },
  aiContent: {
    flex: 1,
    gap: Spacing.two,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 18,
    borderTopLeftRadius: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  aiText: {
    color: C.text,
    fontSize: 15,
    lineHeight: 21,
  },
  failedBubble: {
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  failedText: {
    color: C.warning,
  },
});
