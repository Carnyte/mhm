// Chapter remapping: when a site reorders or deletes chapters (AO3 and Wattpad chapters have ids),
// read marks, progress, the last chapter, downloads, bookmarks and the listen position follow
// their chapter.

import {
  remapBookmarks,
  remapChapters,
  remapNumber,
  remapNumbers,
  remapPosition,
  remapRecord,
  remapStoryState,
} from '../src/sources/remap';

describe('remapChapters', () => {
  it('finds nothing to do when the ids are the same, or chapters were only added', () => {
    expect(remapChapters(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual({ moves: { 1: 1, 2: 2, 3: 3 }, removed: [], changed: false });
    expect(remapChapters(['a', 'b'], ['a', 'b', 'c', 'd']).changed).toBe(false);
  });

  it('follows reordered chapters', () => {
    const r = remapChapters(['a', 'b', 'c'], ['c', 'a', 'b']);
    expect(r).toEqual({ moves: { 1: 2, 2: 3, 3: 1 }, removed: [], changed: true });
  });

  it('reports deleted chapters and moves the later ones up', () => {
    const r = remapChapters(['a', 'b', 'c', 'd'], ['a', 'c', 'd']);
    expect(r).toEqual({ moves: { 1: 1, 3: 2, 4: 3 }, removed: [2], changed: true });
  });

  it('keeps chapters without a known id at their number while that number exists', () => {
    expect(remapChapters([undefined, 'b', null], ['x', 'b'])).toEqual({ moves: { 1: 1, 2: 2 }, removed: [3], changed: true });
  });
});

describe('applying a remap', () => {
  // Chapter 2 of 4 was deleted, and the new chapter 1 was inserted before the old first chapter.
  const r = remapChapters(['a', 'b', 'c', 'd'], ['new', 'a', 'c', 'd']);

  it('maps numbers, sets and records', () => {
    expect(remapNumber(1, r)).toBe(2);
    expect(remapNumber(2, r)).toBeUndefined();
    expect(remapNumber(9, r)).toBe(9);
    expect(remapNumbers([1, 2, 3, 4], r)).toEqual([2, 3, 4]);
    expect(remapNumbers(undefined, r)).toBeUndefined();
    expect(remapRecord({ 1: 1, 2: 0.5, 4: 0.25 }, r)).toEqual({ 2: 1, 4: 0.25 });
  });

  it('moves the reading state of a story', () => {
    expect(
      remapStoryState({ readChapters: [1, 2], downloadedChapters: [1, 2, 3, 4], chapterProgress: { 1: 1, 3: 0.4 }, lastChapter: 3, lastProgress: 0.4 }, r),
    ).toEqual({ readChapters: [2], downloadedChapters: [2, 3, 4], chapterProgress: { 2: 1, 3: 0.4 }, lastChapter: 3, lastProgress: 0.4 });
  });

  it('resumes at the start of the nearest earlier chapter when the last one read is gone', () => {
    expect(remapStoryState({ lastChapter: 2, lastProgress: 0.7 }, r)).toMatchObject({ lastChapter: 2, lastProgress: 0 });
    const first = remapChapters(['a', 'b'], ['b']);
    expect(remapStoryState({ lastChapter: 1, lastProgress: 0.5 }, first)).toMatchObject({ lastChapter: 1, lastProgress: 0 });
  });

  it('changes nothing when nothing moved', () => {
    expect(remapStoryState({ lastChapter: 2, readChapters: [1] }, remapChapters(['a', 'b'], ['a', 'b']))).toEqual({});
  });

  it('moves this story’s bookmarks only, keeping ones in deleted chapters', () => {
    const marks = [
      { id: '1', storyKey: 'ao3:5', chapter: 1, progress: 0.2 },
      { id: '2', storyKey: 'ao3:5', chapter: 2, progress: 0.9 },
      { id: '3', storyKey: 'ffn:5', chapter: 1, progress: 0.3 },
    ];
    expect(remapBookmarks(marks, 'ao3:5', r)).toEqual([
      { id: '1', storyKey: 'ao3:5', chapter: 2, progress: 0.2 },
      { id: '2', storyKey: 'ao3:5', chapter: 2, progress: 0 },
      { id: '3', storyKey: 'ffn:5', chapter: 1, progress: 0.3 },
    ]);
  });

  it('moves the listen position, or drops it when its chapter is gone', () => {
    expect(remapPosition({ chapter: 4, index: 12, at: 1 }, r)).toEqual({ chapter: 4, index: 12, at: 1 });
    expect(remapPosition({ chapter: 1, index: 3, at: 1 }, r)).toEqual({ chapter: 2, index: 3, at: 1 });
    expect(remapPosition({ chapter: 2, index: 3, at: 1 }, r)).toBeUndefined();
    expect(remapPosition(undefined, r)).toBeUndefined();
  });
});
