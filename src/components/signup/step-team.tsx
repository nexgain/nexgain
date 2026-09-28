import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { StyleSheet, Text, View } from 'react-native';

import { Button, fieldStyles, Icon, SignupColors as C } from '@/components/signup/fields';
import { inviteLink } from '@/data/business';

export function StepTeam({
  inviteCode,
  onFinish,
}: {
  inviteCode: string;
  onFinish: () => void;
}) {
  const [copied, setCopied] = useState<'code' | 'link' | 'failed' | null>(null);
  const link = inviteLink(inviteCode);

  async function copy(what: 'code' | 'link') {
    try {
      await Clipboard.setStringAsync(what === 'code' ? inviteCode : link);
      setCopied(what);
    } catch {
      // Clipboard blocked (e.g. browser permissions); the code is still selectable on screen.
      setCopied('failed');
    }
  }

  return (
    <>
      <View style={fieldStyles.card}>
        <Text style={styles.label}>Your business invite code</Text>
        <Text style={styles.code} selectable accessibilityLabel={`Invite code ${inviteCode.split('').join(' ')}`}>
          {inviteCode}
        </Text>
        <Text style={styles.help}>Employees enter this code when they sign up to join your business.</Text>
        <Button
          label={copied === 'code' ? 'Code copied!' : 'Copy Code'}
          variant="secondary"
          icon={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
          onPress={() => copy('code')}
        />
      </View>

      <View style={fieldStyles.card}>
        <Text style={styles.label}>Invite link</Text>
        <Text style={styles.link} selectable numberOfLines={2}>
          {link}
        </Text>
        <Button
          label={copied === 'link' ? 'Link copied!' : 'Copy Link'}
          variant="secondary"
          icon={{ ios: 'link', android: 'link', web: 'link' }}
          onPress={() => copy('link')}
        />
      </View>

      {copied === 'failed' && (
        <Text style={styles.failed}>Couldn&apos;t copy automatically. Press and hold the code or link to copy it.</Text>
      )}

      <View style={styles.note}>
        <Icon name={{ ios: 'info.circle.fill', android: 'info', web: 'info' }} color={C.primary} size={16} />
        <Text style={styles.noteText}>Employees will need to add their own bank details so they can receive payments.</Text>
      </View>

      <Button label="Create Dashboard" variant="green" arrow onPress={onFinish} />
      <Button label="Skip for now" variant="ghost" onPress={onFinish} />
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  code: {
    color: C.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 3,
  },
  help: {
    color: C.textSecondary,
    fontSize: 14,
  },
  link: {
    color: C.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  failed: {
    color: C.danger,
    fontSize: 13,
  },
  note: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
  },
  noteText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
