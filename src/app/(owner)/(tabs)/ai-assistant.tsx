import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type TextInputInstance } from 'react-native';

import { AI_ACCENT, AI_ACCENT_SOFT, AiInsightsList, ResultCardView, RosterPicker, SampleNote } from '@/components/owner/ai-ui';
import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { Button, Card, Icon, OwnerIcons, OwnerScreen, ownerStyles, PageHeader, type IconName } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import {
  askAssistant,
  clearChat,
  deleteAllSavedChats,
  deleteSavedChat,
  newChat,
  openChat,
  retryLast,
  useAiChat,
  type Chat,
  type ChatMessage,
} from '@/data/ai-chat';
import { closeSamplePreview, previewSampleInsights, refreshAiInsights, useSampleSnapshot } from '@/data/ai-insights';
import { formatShortDate } from '@/data/employee-roster';

const SUGGESTIONS: { label: string; question: string; icon: IconName }[] = [
  { label: 'Find this job', question: 'Find my next job', icon: OwnerIcons.calendar },
  { label: 'Find a transaction', question: 'Find my most recent transactions', icon: OwnerIcons.card },
  { label: 'Which invoices are overdue?', question: 'Which invoices are overdue?', icon: OwnerIcons.receipt },
  { label: 'Have material costs increased?', question: 'Have material costs increased?', icon: OwnerIcons.trendingUp },
];

/**
 * Voice: the phone keyboard's own microphone types what you say (Expo has no
 * in-app speech-to-text, and this way it works in Expo Go with nothing to install).
 */
const MIC_TIP =
  Platform.OS === 'ios'
    ? {
        how: "Tap the microphone on your keyboard (bottom right) and say your question. Tap it again when you're done.",
        missing: "No microphone on the keyboard? Open Settings > General > Keyboard and turn on Enable Dictation.",
      }
    : Platform.OS === 'android'
      ? {
          how: 'Tap the microphone on your keyboard (top right on Gboard) and say your question.',
          missing: 'No microphone? Open Settings > System > Keyboard > Gboard > Voice typing and turn it on.',
        }
      : {
          how: "Use your computer's dictation to speak your question into the box.",
          missing: 'On a Mac press the Fn key twice; on Windows press the Windows key + H.',
        };

/** Previous chats shown before "See all". */
const SHOWN_CHATS = 5;

// The owner's AI Assistant: ask anything about the business, see what needs
// attention, and tap through to the real jobs, invoices and people.
export default function AiAssistantScreen() {
  const { current, saved, sending } = useAiChat();
  const sample = useSampleSnapshot() !== null;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'clear' | 'delete-all' | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const chatOpen = current.messages.length > 0;

  // "Ask AI about this" on an insight opens this screen with a question ready to send.
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const navigation = useNavigation();
  useEffect(() => {
    if (!ask) return;
    askAssistant(ask);
    navigation.setParams({ ask: undefined } as never);
  }, [ask, navigation]);

  // New answers scroll into view (the chat and its type bar are at the top, under the header).
  const count = current.messages.length;
  const chatY = useRef(0);
  const chatHeight = useRef(0);
  useEffect(() => {
    if (count === 0) return;
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, chatY.current + chatHeight.current - 520), animated: true }), 150);
  }, [count, sending]);

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    setRefreshError(await refreshAiInsights());
    setRefreshing(false);
  }

  const attention = (
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
  );

  return (
    <OwnerScreen scrollRef={scrollRef}>
      <PageHeader
        title="AI Assistant"
        subtitle="Ask anything about your business"
        right={chatOpen ? <Button label="New chat" icon={OwnerIcons.sparkles} variant="secondary" onPress={newChat} /> : undefined}
      />

      {chatOpen ? (
        <View
          onLayout={(e) => {
            chatY.current = e.nativeEvent.layout.y;
            chatHeight.current = e.nativeEvent.layout.height;
          }}>
          <Card
            title={current.title || 'Chat'}
            icon={OwnerIcons.sparkles}
            right={
              <Pressable
                onPress={() => setConfirm('clear')}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Clear this chat"
                hitSlop={8}
                style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
                <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.textSecondary} size={14} />
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            }>
            {sample && <SampleNote />}
            <View style={styles.thread}>
              {current.messages.map((m) => (
                <Message key={m.id} message={m} onRetry={retryLast} />
              ))}
              {sending && (
                <View style={styles.aiRow}>
                  <Avatar />
                  <View style={[styles.aiBubble, styles.thinking]}>
                    <ActivityIndicator color={AI_ACCENT} size="small" />
                    <Text style={styles.aiText}>Looking into it…</Text>
                  </View>
                </View>
              )}
            </View>
            {/* Keep the conversation going, right under the latest answer. */}
            <ChatInput placeholder="Ask a follow-up question…" disabled={sending} />
            <Text style={ownerStyles.mutedText}>The AI only uses your NexGain data. Check anything important before acting on it.</Text>
            <View style={styles.chatFooter}>
              {/* Files this chat under Previous chats and starts a fresh one (the same as New chat). */}
              <Button
                label={sample ? 'Save chat (not in preview)' : 'Save chat'}
                icon={{ ios: 'tray.and.arrow.down.fill', android: 'save', web: 'save' }}
                disabled={sending || sample}
                onPress={newChat}
              />
              <Button
                label="Clear chat"
                icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
                variant="secondary"
                disabled={sending}
                onPress={() => setConfirm('clear')}
              />
            </View>
          </Card>
        </View>
      ) : (
        <>
          <Card title="Ask NexGain AI" icon={OwnerIcons.sparkles}>
            <ChatInput placeholder="Ask anything about your business" disabled={sending} />
          </Card>

          {attention}

          <View style={styles.suggestions}>
            <Text style={styles.sectionTitle}>Try asking...</Text>
            <View style={styles.grid}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s.label}
                  onPress={() => askAssistant(s.question)}
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
        </>
      )}

      <PreviousChats chats={saved} disabled={sending} onDeleteAll={() => setConfirm('delete-all')} />

      {chatOpen && attention}

      <ConfirmDialog
        visible={confirm !== null}
        message={
          confirm === 'clear'
            ? "Clear this chat? It will be deleted and won't be kept in Previous chats."
            : 'Delete all previous chats from this phone?'
        }
        confirmLabel={confirm === 'clear' ? 'Clear chat' : 'Delete all'}
        onConfirm={() => {
          if (confirm === 'clear') clearChat();
          else deleteAllSavedChats();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </OwnerScreen>
  );
}

/** The question box: type (or use the keyboard's microphone) and send. */
function ChatInput({ placeholder, disabled }: { placeholder: string; disabled: boolean }) {
  const [text, setText] = useState('');
  const [showMicTip, setShowMicTip] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const canSend = !!text.trim() && !disabled;

  function send() {
    if (!canSend) return;
    askAssistant(text);
    setText('');
    setShowMicTip(false);
  }

  return (
    <View style={styles.inputWrap}>
      <View style={styles.inputBox}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={C.textSecondary}
          multiline
          maxLength={4000}
          returnKeyType="send"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={send}
          accessibilityLabel={placeholder}
          style={styles.input}
        />
        <Pressable
          onPress={() => {
            // Speech-to-text uses the keyboard's own microphone (works in Expo Go, nothing to install).
            // Re-focusing brings the keyboard back up even if it was just closed.
            inputRef.current?.blur();
            setTimeout(() => inputRef.current?.focus(), 50);
            setShowMicTip(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Speak your question"
          hitSlop={6}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Icon name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }} color={C.textSecondary} size={18} />
        </Pressable>
        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={({ pressed }) => [styles.sendButton, !canSend && styles.disabled, pressed && styles.pressed]}>
          <Icon name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} color="#FFFFFF" size={18} />
        </Pressable>
      </View>
      {showMicTip && (
        <View style={styles.micTip}>
          <Icon name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }} color={C.accent} size={16} />
          <View style={styles.flex}>
            <Text style={styles.micTipText}>{MIC_TIP.how}</Text>
            <Text style={styles.hint}>{MIC_TIP.missing}</Text>
          </View>
          <Pressable onPress={() => setShowMicTip(false)} accessibilityRole="button" accessibilityLabel="Close tip" hitSlop={10}>
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.textSecondary} size={14} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Chats from before: tap one to carry on with it, or delete it. */
function PreviousChats({ chats, disabled, onDeleteAll }: { chats: Chat[]; disabled: boolean; onDeleteAll: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const sample = useSampleSnapshot() !== null;
  if (chats.length === 0) {
    return (
      <Card title="Previous chats" icon={{ ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }}>
        <Text style={ownerStyles.mutedText}>
          {sample
            ? "Chats during the sample preview aren't saved. Close the preview to keep your chats here."
            : 'No previous chats yet. When you tap New chat, the chat you were having is saved here so you can come back to it.'}
        </Text>
      </Card>
    );
  }
  const shown = showAll ? chats : chats.slice(0, SHOWN_CHATS);
  return (
    <Card
      title="Previous chats"
      icon={{ ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }}
      right={
        <Pressable onPress={onDeleteAll} disabled={disabled} accessibilityRole="button" accessibilityLabel="Delete all previous chats" hitSlop={8}>
          <Text style={styles.clearText}>Delete all</Text>
        </Pressable>
      }>
      {shown.map((chat, i) => {
        const questions = chat.messages.filter((m) => m.role === 'user').length;
        return (
          <View key={chat.id} style={[styles.savedRow, i > 0 && styles.divider]}>
            <Pressable
              onPress={() => openChat(chat.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Open chat: ${chat.title}`}
              style={({ pressed }) => [styles.savedMain, pressed && styles.pressed]}>
              <Icon name={{ ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }} color={AI_ACCENT} size={16} />
              <View style={styles.flex}>
                <Text style={styles.savedTitle} numberOfLines={1}>
                  {chat.title || 'Chat'}
                </Text>
                <Text style={styles.savedMeta}>
                  {formatShortDate(new Date(chat.updatedAt))} · {questions} {questions === 1 ? 'question' : 'questions'}
                </Text>
              </View>
              <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
            </Pressable>
            <Pressable
              onPress={() => deleteSavedChat(chat.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Delete chat: ${chat.title}`}
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.textSecondary} size={15} />
            </Pressable>
          </View>
        );
      })}
      {chats.length > SHOWN_CHATS && (
        <Button label={showAll ? 'Show fewer' : `See all ${chats.length} chats`} variant="secondary" onPress={() => setShowAll(!showAll)} />
      )}
    </Card>
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
        {m.roster && <RosterPicker messageId={m.id} proposal={m.roster} done={!!m.rosterDone} />}
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
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  inputWrap: {
    gap: Spacing.two,
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
    lineHeight: 18,
  },
  micTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: AI_ACCENT_SOFT,
  },
  micTipText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  error: {
    color: C.warning,
    fontSize: 13,
  },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  chatFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  clearText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
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
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  savedMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
  },
  savedTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  savedMeta: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 2,
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
    // Inside the chat card, so one step lighter than the card itself.
    backgroundColor: C.surfaceRaised,
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
