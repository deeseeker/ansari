import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useSourcePanelEdge } from '@/hooks/useSourcePanel';
import { fonts } from '@/constants/colors';
import { toast } from '@/lib/toast';
import { isHovered } from '@/lib/web';

/**
 * Account chrome: the way in, kept in the top-right corner where a
 * reader looks for it, on every desktop screen.
 *
 * Two words of plain text on the paper — no pill, no glass, no rule.
 * Nothing scrolls under this corner and nothing competes with it, so a
 * panel here would only be a box drawn around two links.
 *
 * Desktop only, like the rail: phones reach the same actions from the
 * sheet, and two competing sets of chrome on a small screen is one too
 * many. Callers gate it on `useDesktop()`.
 */
export function AccountChrome() {
  const colors = useColors();
  // The corner belongs to the page, so it travels with it: when the
  // sources panel takes the right edge, these move off that edge on the
  // same frames rather than being buried under it.
  const edge = useSourcePanelEdge(CORNER_INSET);

  // "Coming soon" is news, not a decision — it takes a notice at the
  // edge of the screen rather than a dialog across the middle of it.
  const showLogin = () =>
    toast('Sign-in is on the way', {
      detail:
        'Ansari works without an account for now. Signing in to keep your conversations across devices is coming.',
    });

  const showSignUp = () =>
    toast('Accounts are on the way', {
      detail:
        'You can ask Ansari anything today without signing up — keeping your questions across devices is coming.',
    });

  return (
    <Animated.View style={[styles.wrap, edge]}>
      <Pressable
        onPress={showLogin}
        accessibilityRole="button"
        testID="login-button"
        style={(state) => [
          styles.link,
          { opacity: state.pressed ? 0.6 : isHovered(state) ? 1 : 0.75 },
        ]}
      >
        <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
          Log in
        </Text>
      </Pressable>

      <Pressable
        onPress={showSignUp}
        accessibilityRole="button"
        testID="signup-button"
        style={(state) => [
          styles.link,
          { opacity: state.pressed ? 0.6 : isHovered(state) ? 1 : 0.9 },
        ]}
      >
        <Text style={[styles.linkText, { color: colors.foreground }]}>
          Sign up
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** How far the corner sits in from the window's right edge at rest. */
const CORNER_INSET = 26;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 18,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  link: {
    minHeight: 28,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  linkText: {
    fontSize: 12.5,
    fontFamily: fonts.bodyMedium,
  },
});
