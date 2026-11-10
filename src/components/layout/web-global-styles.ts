import { Platform } from 'react-native';

import { Desktop, Palette } from '@/constants/theme';

/**
 * Computer-only finishing touches for the web app: a pointer cursor and a soft
 * hover on everything clickable, a clear keyboard focus ring and slim scrollbars.
 * Only applies in browser windows at least Desktop.minWidth wide, so phones
 * (and the native app, where this never runs) look exactly the same.
 */
const CSS = `
@media (min-width: ${Desktop.minWidth}px) {
  [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"] {
    cursor: pointer;
    transition: filter 120ms ease, background-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
  }
  [aria-disabled="true"] { cursor: default; }
  [role="button"]:not([aria-disabled="true"]):hover,
  [role="tab"]:not([aria-disabled="true"]):hover,
  [role="checkbox"]:hover, [role="radio"]:hover, [role="switch"]:hover {
    filter: brightness(0.96);
  }
  :focus-visible { outline: 2px solid ${Palette.primary}; outline-offset: 2px; }
  input:focus-visible, textarea:focus-visible { outline: none; }
  * { scrollbar-width: thin; scrollbar-color: #CBD5E1 transparent; }
}
`;

let added = false;

/** Adds the styles to the page once (web only; does nothing on phones' native app). */
export function addWebGlobalStyles() {
  if (Platform.OS !== 'web' || added || typeof document === 'undefined') return;
  added = true;
  const style = document.createElement('style');
  style.setAttribute('data-nexgain', 'desktop');
  style.textContent = CSS;
  document.head.appendChild(style);
}
