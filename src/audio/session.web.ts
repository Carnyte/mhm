// Web build (dev harness): browsers handle speech themselves; no lock screen to drive.

export type RemoteCommand = 'play' | 'pause' | 'toggle' | 'next' | 'previous';

export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
}

export function onRemoteCommand(_fn: (cmd: RemoteCommand) => void) {}
export async function activate(_mixWithOthers = false) {}
export function setNowPlaying(_m: NowPlaying) {}
export function setPlaying(_playing: boolean) {}
export function deactivate() {}
