import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useNavigation } from 'expo-router';

/**
 * Clears a screen's one-off params (e.g. "open on this date") when the owner
 * leaves the screen, so next time it opens normally.
 *
 * Only clears when there's something to clear, and never while the screen is
 * being removed (app start-up redirects, signing out): there's no navigator
 * left then, and React Navigation warns "SET_PARAMS was not handled".
 */
export function useClearParamsOnLeave(params: Record<string, string | undefined>) {
  const navigation = useNavigation();
  const current = useRef(params);
  useEffect(() => {
    current.current = params;
  });
  const removing = useRef(false);

  // Declared before useFocusEffect so this cleanup runs first when the screen is removed.
  useEffect(
    () => () => {
      removing.current = true;
    },
    [],
  );

  useFocusEffect(
    useCallback(
      () => () => {
        if (removing.current) return;
        const set = Object.keys(current.current).filter((key) => current.current[key] !== undefined);
        if (set.length === 0) return;
        navigation.setParams(Object.fromEntries(set.map((key) => [key, undefined])) as never);
      },
      [navigation],
    ),
  );
}
