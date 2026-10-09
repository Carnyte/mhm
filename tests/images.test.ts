// Image loading: FanFiction.net's own images (relative /image/… paths and www.fanfiction.net URLs)
// come through the bridge; files on the device, inline data: images and every other site's or
// CDN's https URL load directly.

const mockDataUri = jest.fn(async (path: string) => `data:image/jpeg;base64,${Buffer.from(path).toString('base64')}`);
jest.mock('../src/net/bridge', () => ({ bridge: { dataUri: (p: string) => mockDataUri(p) } }));

import { clearImageCache, directImageUri, loadImage } from '../src/net/images';

beforeEach(() => {
  mockDataUri.mockClear();
  clearImageCache();
});

describe('directImageUri', () => {
  it.each([
    ['file:///var/mobile/Containers/Data/imports/abc/cover.jpg', 'file:///var/mobile/Containers/Data/imports/abc/cover.jpg'],
    ['data:image/png;base64,iVBORw0KGgo=', 'data:image/png;base64,iVBORw0KGgo='],
    ['https://ff77.b-cdn.net/image/4242/180/', 'https://ff77.b-cdn.net/image/4242/180/'],
    ['//ff77.b-cdn.net/image/4242/75/', 'https://ff77.b-cdn.net/image/4242/75/'],
    ['https://img.wattpad.com/cover/6315313-256-k307163.jpg', 'https://img.wattpad.com/cover/6315313-256-k307163.jpg'],
    ['https://archiveofourown.org/images/skins/iconsets/default/icon_user.png', 'https://archiveofourown.org/images/skins/iconsets/default/icon_user.png'],
    ['http://example.com/a.gif', 'http://example.com/a.gif'],
  ])('%s loads directly', (path, uri) => {
    expect(directImageUri(path)).toBe(uri);
  });

  it.each(['/image/4242/180/', 'image/4242/75/', 'https://www.fanfiction.net/image/4242/180/'])('%s goes through the bridge', (path) => {
    expect(directImageUri(path)).toBeNull();
  });
});

describe('loadImage', () => {
  it('fetches FanFiction.net images through the bridge, once', async () => {
    const a = await loadImage('/image/1/180/');
    const b = await loadImage('/image/1/180/');
    expect(a).toMatch(/^data:image\/jpeg;base64,/);
    expect(b).toBe(a);
    expect(mockDataUri).toHaveBeenCalledTimes(1);
  });

  it('never sends files, data: images or other sites’ images to the bridge', async () => {
    await expect(loadImage('file:///x/cover.png')).resolves.toBe('file:///x/cover.png');
    await expect(loadImage('data:image/gif;base64,R0lGOD')).resolves.toBe('data:image/gif;base64,R0lGOD');
    await expect(loadImage('https://img.wattpad.com/cover/1-512-k1.jpg')).resolves.toBe('https://img.wattpad.com/cover/1-512-k1.jpg');
    expect(mockDataUri).not.toHaveBeenCalled();
  });
});
