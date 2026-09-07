import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { AnsariMarkPulse } from '@/components/AnsariMarkPulse';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { DURATION, EASE_OUT } from '@/constants/motion';

// A line of status arriving: a small change in place, held back a beat
// so an answer that comes straight back never shows it at all.
const WAIT_ENTER = FadeIn.duration(DURATION.state)
  .easing(EASE_OUT)
  .delay(180)
  .reduceMotion(ReduceMotion.System);

/**
 * The waiting state sits on the paper exactly as the answer will —
 * unboxed, so nothing has to dissolve away when the text arrives. It
 * only fades in (no travel), beneath the question that prompted it.
 *
 * Drawn on both screens: it appears under the lifted question on the
 * home screen while the conversation is being created, and continues
 * into the thread. Pass `animate={false}` where it is already on screen
 * (the thread's first frame), so it does not fade in a second time.
 */
export function ThinkingLine({ animate = true }: { animate?: boolean }) {
  const colors = useColors();
  return (
    <Animated.View
      entering={animate ? WAIT_ENTER : undefined}
      style={styles.row}
    >
      {/* Sized to the line of type it stands in, not to an icon slot:
          the mark's height is the text's own em box, so its star sits
          level with the ascenders and its arcs with the descenders,
          and it reads as the first character of the line. */}
      <AnsariMarkPulse height={MARK_HEIGHT} />
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        Searching the sources…
      </Text>
    </Animated.View>
  );
}

/** The status line's own size, so the mark stands as tall as the type. */
const MARK_HEIGHT = 15;

const styles = StyleSheet.create({
  // No card: the same air the answer sits in, so the answer can simply
  // replace these words without a surface dissolving away.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 15,
    fontFamily: fonts.displayItalic,
  },
});
