import { useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SignupColors as C } from '@/components/signup/fields';
import { STEP_NAMES } from '@/components/signup/types';

const LOGO = require('@/assets/nexgain-logo.png');
const LOGO_RATIO = 978 / 634;
const WIDE = 768;

/**
 * Frame for every sign-up step: dark sidebar with numbered steps on wide screens
 * (a compact progress strip on phones) and a white content area.
 */
export function SignupShell({
  step,
  title,
  subtitle,
  onBack,
  onSelectStep,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  onBack: () => void;
  onSelectStep: (step: number) => void;
  children: ReactNode;
}) {
  // Measured width (not window size) so the web build also lays out correctly.
  const [width, setWidth] = useState(0);
  const wide = width >= WIDE;

  const content = (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        key={step}
        style={styles.flex}
        contentContainerStyle={[styles.contentScroll, wide && styles.contentScrollWide]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.contentInner}>
          <View style={styles.contentHeader}>
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={10}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={C.text} size={16} />
            </Pressable>
            <Text style={styles.stepCount}>
              Step {step + 1} of {STEP_NAMES.length}
            </Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.body}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <View style={styles.root} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {wide ? (
        <View style={styles.row}>
          <SafeAreaView edges={['top', 'bottom', 'left']} style={styles.sidebar}>
            <Image source={LOGO} style={styles.sidebarLogo} contentFit="contain" accessibilityLabel="NexGain" />
            <Text style={styles.sidebarHeading}>Set up your business</Text>
            <View style={styles.stepList}>
              {STEP_NAMES.map((name, i) => (
                <StepRow key={name} index={i} name={name} current={step} onSelect={onSelectStep} />
              ))}
            </View>
          </SafeAreaView>
          <SafeAreaView edges={['top', 'bottom', 'right']} style={styles.content}>
            {content}
          </SafeAreaView>
        </View>
      ) : (
        <>
          <SafeAreaView edges={['top']} style={styles.topBar}>
            <View style={styles.topBarHeader}>
              <Image source={LOGO} style={styles.topLogo} contentFit="contain" accessibilityLabel="NexGain" />
              <Text style={styles.topStepName}>{STEP_NAMES[step]}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.progress}>
              {STEP_NAMES.map((name, i) => (
                <StepDot key={name} index={i} name={name} current={step} onSelect={onSelectStep} />
              ))}
            </ScrollView>
          </SafeAreaView>
          <SafeAreaView edges={['bottom']} style={styles.content}>
            {content}
          </SafeAreaView>
        </>
      )}
    </View>
  );
}

function StepCircle({ index, current, size = 26 }: { index: number; current: number; size?: number }) {
  const done = index < current;
  const active = index === current;
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        done && styles.circleDone,
        active && styles.circleActive,
      ]}>
      {done ? (
        <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor="#FFFFFF" size={size * 0.5} />
      ) : (
        <Text style={[styles.circleText, active && styles.circleTextActive]}>{index + 1}</Text>
      )}
    </View>
  );
}

function StepRow({
  index,
  name,
  current,
  onSelect,
}: {
  index: number;
  name: string;
  current: number;
  onSelect: (step: number) => void;
}) {
  const active = index === current;
  const done = index < current;
  return (
    <Pressable
      onPress={() => done && onSelect(index)}
      disabled={!done}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !done }}
      accessibilityLabel={`Step ${index + 1}: ${name}${done ? ', completed' : ''}`}
      style={[styles.stepRow, active && styles.stepRowActive]}>
      <StepCircle index={index} current={current} />
      <Text style={[styles.stepName, (active || done) && styles.stepNameStrong]}>{name}</Text>
    </Pressable>
  );
}

function StepDot({
  index,
  name,
  current,
  onSelect,
}: {
  index: number;
  name: string;
  current: number;
  onSelect: (step: number) => void;
}) {
  const done = index < current;
  return (
    <Pressable
      onPress={() => done && onSelect(index)}
      disabled={!done}
      accessibilityRole="button"
      accessibilityLabel={`Step ${index + 1}: ${name}${done ? ', completed' : ''}`}
      style={styles.dotItem}>
      <StepCircle index={index} current={current} size={24} />
      {index < STEP_NAMES.length - 1 && <View style={[styles.connector, done && styles.connectorDone]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.sidebar,
  },
  flex: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  pressed: {
    opacity: 0.7,
  },
  sidebar: {
    width: 280,
    backgroundColor: C.sidebar,
    paddingHorizontal: 20,
  },
  sidebarLogo: {
    width: 150,
    aspectRatio: LOGO_RATIO,
    marginTop: 28,
    marginBottom: 24,
  },
  sidebarHeading: {
    color: C.sidebarMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  stepList: {
    gap: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  stepRowActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.22)',
  },
  stepName: {
    color: C.sidebarMuted,
    fontSize: 15,
  },
  stepNameStrong: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  circleDone: {
    backgroundColor: C.done,
    borderColor: C.done,
  },
  circleActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  circleText: {
    color: C.sidebarMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  circleTextActive: {
    color: '#FFFFFF',
  },
  topBar: {
    backgroundColor: C.sidebar,
    paddingBottom: 12,
  },
  topBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  topLogo: {
    width: 84,
    aspectRatio: LOGO_RATIO,
  },
  topStepName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  progress: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  dotItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connector: {
    width: 12,
    height: 2,
    marginHorizontal: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  connectorDone: {
    backgroundColor: C.done,
  },
  content: {
    flex: 1,
    backgroundColor: C.page,
  },
  contentScroll: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 32,
  },
  contentScrollWide: {
    padding: 40,
  },
  contentInner: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  stepCount: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: C.text,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  body: {
    marginTop: 24,
    gap: 18,
  },
});
