// The preview screen shown before an email is sent from the owner's connected
// Gmail / Outlook account (no email app opens, so this is where they check it).
// Shows To, Subject, the message and the attachment, with Edit and Send.
// If the account stopped working, offers Reconnect or the phone's email app instead.
// Mounted once in the root layout; opened by openEmailDraft() in src/lib/email.ts.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { connectAccount, PROVIDER_NAME } from '@/data/connected-accounts';
import {
  attachmentName,
  emailPreviewStore,
  openInEmailApp,
  sendFromAccount,
  type EmailPreviewRequest,
  type SendFailure,
} from '@/lib/email';

export function EmailPreviewHost() {
  const request = emailPreviewStore.use();
  return (
    <Modal
      visible={request !== null}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={() => request?.finish('not_sent')}>
      {/* A fresh screen for each email. */}
      {request && <EmailPreview key={`${request.draft.to}|${request.draft.subject}`} request={request} />}
    </Modal>
  );
}

type Stage = 'preview' | 'editing' | 'sending' | 'reconnecting';

function EmailPreview({ request }: { request: EmailPreviewRequest }) {
  const [account, setAccount] = useState(request.account);
  const [subject, setSubject] = useState(request.draft.subject);
  const [body, setBody] = useState(request.draft.body);
  const [stage, setStage] = useState<Stage>('preview');
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const draft = { ...request.draft, subject, body };
  const editing = stage === 'editing';
  const busy = stage === 'sending' || stage === 'reconnecting';
  const appName = request.app === 'outlook' ? 'Outlook' : 'Gmail';

  async function send() {
    if (!subject.trim()) {
      setNotice('Add a subject first.');
      return;
    }
    setStage('sending');
    setFailure(null);
    setNotice(null);
    const result = await sendFromAccount(draft, account).catch(
      (): SendFailure => ({ reconnect: false, message: "The email couldn't be sent. Please try again." }),
    );
    if (!result) {
      request.finish('sent');
      return;
    }
    setFailure(result);
    setStage('preview');
  }

  async function reconnect() {
    setStage('reconnecting');
    setNotice(null);
    const result = await connectAccount(account.provider);
    setStage('preview');
    if (result.status === 'connected') {
      setAccount({ ...account, email: result.email });
      setFailure(null);
      setNotice(`Reconnected as ${result.email}. Tap Send to send the email.`);
    } else if (result.status === 'cancelled') {
      setNotice(`The ${PROVIDER_NAME[account.provider]} login was cancelled.`);
    } else {
      setNotice(result.message);
    }
  }

  function sendWithEmailApp() {
    // Close this screen first; iPhone can't open the email screen over it.
    request.finish(new Promise((resolve) => setTimeout(resolve, 450)).then(() => openInEmailApp(draft, request.app)));
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable
            onPress={() => request.finish('not_sent')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Cancel, don't send"
            hitSlop={8}>
            {({ pressed }) => <Text style={[styles.headerLink, (pressed || busy) && styles.dim]}>Cancel</Text>}
          </Pressable>
          <Text style={styles.title}>Check your email</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.from}>
            Sending from {account.email} ({appName})
          </Text>

          <View style={styles.card}>
            <Row label="To">
              <Text style={styles.value} selectable>
                {draft.to}
              </Text>
            </Row>
            <Row label="Subject">
              {editing ? (
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  style={[styles.value, styles.input]}
                  placeholderTextColor={C.textMuted}
                  placeholder="Subject"
                  maxLength={200}
                  accessibilityLabel="Subject"
                />
              ) : (
                <Text style={styles.value}>{subject}</Text>
              )}
            </Row>
            {draft.attachmentUri && (
              <Row label="Attached">
                <View style={styles.attachment}>
                  <Icon name={{ ios: 'doc.fill', android: 'description', web: 'description' }} color={C.danger} size={16} />
                  <Text style={styles.value} numberOfLines={1}>
                    {attachmentName(draft.attachmentUri)}
                  </Text>
                </View>
              </Row>
            )}
            <View style={styles.messageBox}>
              {editing ? (
                <TextInput
                  value={body}
                  onChangeText={setBody}
                  multiline
                  style={[styles.message, styles.input, styles.messageInput]}
                  textAlignVertical="top"
                  accessibilityLabel="Message"
                />
              ) : (
                <Text style={styles.message} selectable>
                  {body}
                </Text>
              )}
            </View>
          </View>

          {notice && <Text style={styles.notice}>{notice}</Text>}

          {failure && (
            <View style={styles.failure} accessibilityRole="alert">
              <Text style={styles.failureText}>{failure.message}</Text>
              {failure.reconnect && (
                <Button label={`Reconnect ${appName}`} onPress={reconnect} disabled={busy} />
              )}
              <Button label="Send from my phone's email app instead" variant="secondary" onPress={sendWithEmailApp} disabled={busy} />
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={C.accent} />
              <Text style={styles.busyText}>{stage === 'sending' ? 'Sending…' : `Opening ${PROVIDER_NAME[account.provider]} login…`}</Text>
            </View>
          ) : (
            <>
              <View style={styles.flex}>
                <Button fill
                  label={editing ? 'Done' : 'Edit'}
                  variant="secondary"
                  icon={editing ? undefined : { ios: 'pencil', android: 'edit', web: 'edit' }}
                  onPress={() => setStage(editing ? 'preview' : 'editing')}
                />
              </View>
              <View style={styles.flex}>
                <Button fill
                  label="Send"
                  icon={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
                  onPress={send}
                  disabled={failure?.reconnect}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four - 4,
    paddingVertical: Spacing.three - 4,
  },
  headerLink: {
    color: C.accent,
    fontSize: 16,
    fontWeight: '600',
    minWidth: 60,
  },
  headerSpacer: {
    minWidth: 60,
  },
  title: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
  dim: {
    opacity: 0.5,
  },
  content: {
    padding: Spacing.four - 4,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
  },
  from: {
    color: C.textSecondary,
    fontSize: 13,
  },
  card: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.three - 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  label: {
    width: 64,
    color: C.textSecondary,
    fontSize: 14,
  },
  value: {
    color: C.text,
    fontSize: 15,
    flexShrink: 1,
  },
  input: {
    padding: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: C.surface,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  messageBox: {
    padding: Spacing.three - 2,
  },
  message: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
  },
  messageInput: {
    minHeight: 220,
  },
  notice: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  failure: {
    gap: Spacing.three - 4,
    padding: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.danger,
    backgroundColor: C.dangerSoft,
  },
  failureText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.four - 4,
    paddingTop: Spacing.three - 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  busy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  busyText: {
    color: C.textSecondary,
    fontSize: 15,
  },
});
