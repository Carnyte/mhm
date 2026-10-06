import { isMobileSiteUrl, toDesktopUrl } from '../src/net/webviewConfig';
import { describeFetchError } from '../src/net/bridge';

describe('mobile site handling', () => {
  it('recognises m.fanfiction.net URLs only', () => {
    expect(isMobileSiteUrl('https://m.fanfiction.net/login.php')).toBe(true);
    expect(isMobileSiteUrl('https://m.fanfiction.net')).toBe(true);
    expect(isMobileSiteUrl('https://www.fanfiction.net/login.php')).toBe(false);
    expect(isMobileSiteUrl('https://m.fanfiction.network/')).toBe(false);
  });
  it('maps mobile URLs to the desktop site', () => {
    expect(toDesktopUrl('https://m.fanfiction.net/s/1/2/x?a=1')).toBe('https://www.fanfiction.net/s/1/2/x?a=1');
  });
  it('explains fetch failures', () => {
    expect(describeFetchError('Load failed (redirected away from www.fanfiction.net)')).toMatch(/mobile site/);
    expect(describeFetchError('Load failed (bridge page is on m.fanfiction.net)')).toMatch(/mobile site/);
    expect(describeFetchError('Load failed')).toMatch(/internet connection.*\(Load failed\)/);
    expect(describeFetchError('Load failed (bridge page not loaded)')).toMatch(/internet connection/);
    expect(describeFetchError('Something odd')).toBe('Something odd');
  });
});
