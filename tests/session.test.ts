// Background audio session: lock-screen play/pause inference and ±10 s skip detection against a
// fake expo-audio player that sends status updates every 500 ms like the real one.

type Listener = (st: Record<string, unknown>) => void;

const mockAudio = {
  listener: null as Listener | null,
  player: null as null | {
    playing: boolean;
    isLoaded: boolean;
    currentTime: number;
    loop: boolean;
    play: () => void;
    pause: () => void;
    seekTo: (t: number) => Promise<void>;
    addListener: (e: string, fn: Listener) => void;
    setActiveForLockScreen: () => void;
    updateLockScreenMetadata: () => void;
  },
  active: [] as boolean[],
  modes: [] as unknown[],
};

jest.mock('expo-audio', () => ({
  setAudioModeAsync: async (m: unknown) => void mockAudio.modes.push(m),
  setIsAudioActiveAsync: async (a: boolean) => void mockAudio.active.push(a),
  createAudioPlayer: () => {
    mockAudio.player = {
      playing: false,
      isLoaded: true,
      currentTime: 0,
      loop: false,
      play() {
        this.playing = true;
      },
      pause() {
        this.playing = false;
      },
      async seekTo(t: number) {
        this.currentTime = t;
      },
      addListener: (_e: string, fn: Listener) => (mockAudio.listener = fn),
      setActiveForLockScreen: () => {},
      updateLockScreenMetadata: () => {},
    };
    return mockAudio.player;
  },
}));
jest.mock('../assets/audio/silence.wav', () => 1, { virtual: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const session = require('../src/audio/session') as typeof import('../src/audio/session');

const commands: string[] = [];
session.onRemoteCommand((c) => commands.push(c));

/** Advances time, emitting a status every 500 ms while the fake player plays (as AVPlayer does). */
async function run(ms: number) {
  const p = mockAudio.player!;
  for (let t = 0; t < ms; t += 500) {
    jest.advanceTimersByTime(499);
    if (p.playing) {
      p.currentTime += 0.5;
      mockAudio.listener?.({ playing: true, isLoaded: true, currentTime: p.currentTime });
    }
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
  }
}

function status() {
  const p = mockAudio.player!;
  mockAudio.listener?.({ playing: p.playing, isLoaded: true, currentTime: p.currentTime });
}

beforeAll(async () => {
  jest.useFakeTimers();
  await session.activate(false);
  status(); // first loaded status at 0 s re-centres to 20 s
  await Promise.resolve();
  await Promise.resolve();
});
afterAll(() => jest.useRealTimers());
beforeEach(() => (commands.length = 0));

describe('audio session', () => {
  it('re-centres the silent track once it has loaded', () => {
    expect(mockAudio.player!.currentTime).toBe(20);
  });

  it('turns a lock-screen pause and play into commands, despite statuses every 500 ms', async () => {
    session.setPlaying(true);
    await run(2000);
    expect(commands).toEqual([]);
    // Lock screen pause: expo-audio pauses the AVPlayer natively.
    mockAudio.player!.playing = false;
    status();
    await run(1000);
    expect(commands).toEqual(['pause']);
    // Lock screen play: the player runs again and keeps sending statuses.
    mockAudio.player!.playing = true;
    await run(3000);
    expect(commands).toEqual(['pause', 'play']);
  });

  it('maps the ±10 s buttons to next / previous paragraph', async () => {
    session.setPlaying(true);
    await run(1000);
    commands.length = 0;
    mockAudio.player!.currentTime += 10;
    status();
    await run(500);
    mockAudio.player!.currentTime -= 10;
    status();
    await run(500);
    expect(commands).toEqual(['next', 'previous']);
  });

  it('does not report our own play / pause', async () => {
    session.setPlaying(false);
    status();
    await run(1500);
    session.setPlaying(true);
    status();
    await run(1500);
    expect(commands).toEqual([]);
  });

  it('releases ducking while paused in "play over other audio" mode', async () => {
    await session.activate(true);
    mockAudio.active.length = 0;
    session.setPlaying(false);
    expect(mockAudio.active).toEqual([false]);
    await session.activate(false);
  });
});
