// Screen pieces the AO3 review touched: a list whose next page failed can be retried (and the
// creator and series screens say it failed), and every AO3 error keeps "Open on AO3" one tap away.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());
// Icons load a font asynchronously; nothing here looks at them.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { Linking } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ErrorView } from '../src/components/states';
import { usePaged, type PagedState } from '../src/hooks/useQuery';
import { SourceBlockedError } from '../src/net/blocks';
import { RateLimitedError, ServerBusyError } from '../src/net/httpCore';
import { Ao3AdultNoticeError, Ao3ChapterGoneError, Ao3NotFoundError, Ao3UnavailableError } from '../src/sources/ao3/api';

const flush = () => act(async () => {});

describe('a list whose next page failed (flows.4)', () => {
  it('asks for that page again on "Try again" (loadMore stays quiet while it failed)', async () => {
    let api!: PagedState<number, undefined>;
    const asked: number[] = [];
    let failNext = true;
    const fetchPage = async (page: number) => {
      asked.push(page);
      if (page === 2 && failNext) {
        failNext = false;
        throw new Error('AO3 asked FicShelf to slow down.');
      }
      return { items: [page * 10, page * 10 + 1], lastPage: 3 };
    };
    function Probe() {
      api = usePaged<number>('ao3:tag:x', fetchPage, (n) => n);
      return null;
    }
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<Probe />);
    });
    expect(api.items).toEqual([10, 11]);
    await act(async () => api.loadMore());
    expect(api.error?.message).toMatch(/slow down/);
    await act(async () => api.loadMore());
    expect(asked).toEqual([1, 2]);
    await act(async () => api.retry());
    await flush();
    expect(asked).toEqual([1, 2, 2]);
    expect(api.error).toBeUndefined();
    expect(api.items).toEqual([10, 11, 20, 21]);
    act(() => r.unmount());
  });
});

describe('AO3 errors (policy.8)', () => {
  const URL = 'https://archiveofourown.org/works/42';

  function labels(error: unknown, webUrl?: string) {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ErrorView error={error} onRetry={() => {}} webUrl={webUrl} />);
    });
    const buttons = r.root.findAll((n) => typeof n.props.title === 'string' && typeof n.props.onPress === 'function' && typeof n.type !== 'string');
    const titles = [...new Set(buttons.map((b) => b.props.title as string))];
    return { titles, press: (t: string) => buttons.find((b) => b.props.title === t)!.props.onPress(), r };
  }

  it('offer "Open on AO3" next to "Try again" for every AO3 error', () => {
    const errors = [
      new Ao3UnavailableError(502),
      new Ao3NotFoundError(URL),
      new Ao3ChapterGoneError('42', 3, ['1', '2']),
      new Ao3AdultNoticeError('42'),
      new SourceBlockedError('ao3', URL),
      new RateLimitedError('archiveofourown.org', Date.now() + 60_000, 'AO3'),
      new ServerBusyError('archiveofourown.org', Date.now() + 10_000, 'AO3', 502),
    ];
    for (const e of errors) expect([e.name, labels(e, URL).titles]).toEqual([e.name, ['Try again', 'Open on AO3']]);
  });

  it('opens the work on AO3', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    labels(new SourceBlockedError('ao3', URL), URL).press('Open on AO3');
    expect(open).toHaveBeenCalledWith(URL);
  });

  it('leave other sites’ errors as they were', () => {
    expect(labels(new Error('Something else'), 'https://www.fanfiction.net/s/1').titles).toEqual(['Try again']);
    expect(labels(new SourceBlockedError('wp', 'https://www.wattpad.com/1'), 'https://www.wattpad.com/1').titles).toEqual(['Try again']);
    // Without a link to open, nothing new either.
    expect(labels(new Ao3UnavailableError(503)).titles).toEqual(['Try again']);
  });
});
