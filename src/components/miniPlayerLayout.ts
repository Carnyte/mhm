// Where the floating mini player sits, so other overlays and screens can make room for it.
// Depends only on the player state (not the engine), so any component can import it.

import { usePathname } from 'expo-router';
import { usePlayer } from '../audio/state';

export const MINI_PLAYER_HEIGHT = 60;
/** Tab bar height above the safe area (react-navigation's default). */
export const TAB_BAR_HEIGHT = 49;
const TAB_ROUTES = new Set(['/', '/search', '/library', '/updates', '/account']);

export function isTabRoute(pathname: string): boolean {
  return TAB_ROUTES.has(pathname);
}

/** True while the mini player is on screen (hidden in the reader and the full player). */
export function useMiniPlayerVisible(): boolean {
  const pathname = usePathname();
  const active = usePlayer((s) => s.status !== 'idle');
  return active && !pathname.startsWith('/read/') && pathname !== '/listen';
}

/** Bottom space a screen should leave free so the mini player doesn't cover its last rows. */
export function useMiniPlayerInset(): number {
  return useMiniPlayerVisible() ? MINI_PLAYER_HEIGHT + 16 : 0;
}
