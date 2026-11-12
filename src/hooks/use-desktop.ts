import { useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';

import { Desktop, Radius, Shadow } from '@/constants/theme';

/**
 * True only on the web app in a wide window (a laptop or desktop computer).
 * Phones, tablets in the native app and narrow browser windows always get false,
 * so the phone layout never changes.
 *
 * The web build is pre-rendered without a window, so this stays false until the
 * page has loaded in the browser (otherwise React reports a mismatch).
 */
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  // false while pre-rendering and hydrating, true once running in the browser.
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false);
  return Platform.OS === 'web' && inBrowser && width >= Desktop.minWidth;
}

const subscribeNothing = () => () => {};

/** Computer layout: the page column, centred, with roomy padding. `form` is narrower (forms, detail pages). */
export function desktopPage(kind: 'wide' | 'form' = 'wide'): ViewStyle {
  return {
    width: '100%',
    maxWidth: (kind === 'form' ? Desktop.formMaxWidth : Desktop.contentMaxWidth) + Desktop.pagePaddingX * 2,
    alignSelf: 'center',
    paddingHorizontal: Desktop.pagePaddingX,
    paddingTop: Desktop.pagePaddingTop,
  };
}

/** Extra page style for the computer layout (undefined on phones, so nothing changes there). */
export function useDesktopPageStyle(kind: 'wide' | 'form' = 'wide') {
  return useIsDesktop() ? desktopPage(kind) : undefined;
}

/**
 * Turns a phone bottom sheet into a centred dialog on a computer. Add it after the
 * sheet's own style; on phones it's undefined and the sheet is unchanged.
 */
export function useDesktopSheetStyle(): ViewStyle | undefined {
  return useIsDesktop() ? DESKTOP_SHEET : undefined;
}

const DESKTOP_SHEET: ViewStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: Desktop.dialogWidth,
  maxHeight: '80%',
  transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
  borderRadius: Radius.large,
  paddingBottom: 16,
  boxShadow: Shadow.popover,
};
