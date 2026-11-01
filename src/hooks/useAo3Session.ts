// The AO3 login state for screens (src/sources/ao3/session.ts holds it).

import { useSyncExternalStore } from 'react';
import { getAo3Session, subscribeAo3Session, type Ao3SessionState } from '../sources/ao3/session';

export function useAo3Session(): Ao3SessionState {
  return useSyncExternalStore(subscribeAo3Session, getAo3Session, getAo3Session);
}
