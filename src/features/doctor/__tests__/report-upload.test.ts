import {
  extForMime,
  isAllowedMime,
  MAX_FILE_BYTES,
  MAX_IMAGE_WIDTH,
  MAX_PAGES,
  movePage,
  overallProgress,
  progressPercent,
  resizeWidthFor,
  storagePath,
  validatePages,
  type PickedPage,
} from '../report-upload';

const page = (over: Partial<PickedPage> = {}): PickedPage => ({
  key: 'k',
  uri: 'file:///a.jpg',
  mime: 'image/jpeg',
  name: 'a.jpg',
  size: 1000,
  ...over,
});

describe('report upload', () => {
  it('builds the storage path from the contract', () => {
    expect(
      storagePath({ patientId: 'pt', pregnancyId: 'pr', reportId: 'r', fileId: 'f', mime: 'application/pdf' }),
    ).toBe('pt/pr/r/f.pdf');
    expect(storagePath({ patientId: 'pt', pregnancyId: 'pr', reportId: 'r', fileId: 'f', mime: 'image/png' })).toBe('pt/pr/r/f.png');
  });

  it('maps mime types to extensions, defaulting photos to jpg', () => {
    expect(extForMime('image/webp')).toBe('webp');
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('image/heic')).toBe('jpg');
    expect(isAllowedMime('application/pdf')).toBe(true);
    expect(isAllowedMime('video/mp4')).toBe(false);
  });

  it('validates the chosen pages', () => {
    expect(validatePages([])).toEqual(['report.errors.noFiles']);
    expect(validatePages([page()])).toEqual([]);
    expect(validatePages([page({ mime: 'video/mp4' })])).toEqual(['report.errors.badType']);
    expect(validatePages([page({ size: MAX_FILE_BYTES + 1 })])).toEqual(['report.errors.tooBig']);
    expect(validatePages(Array.from({ length: MAX_PAGES + 1 }, (_, i) => page({ key: String(i) })))).toEqual([
      'report.errors.tooManyPages',
    ]);
    expect(validatePages([page({ size: null })])).toEqual([]);
  });

  it('downsizes only large photos', () => {
    expect(resizeWidthFor(4000)).toBe(MAX_IMAGE_WIDTH);
    expect(resizeWidthFor(MAX_IMAGE_WIDTH)).toBeNull();
    expect(resizeWidthFor(800)).toBeNull();
    expect(resizeWidthFor(null)).toBeNull();
  });

  it('reorders pages safely', () => {
    expect(movePage(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(movePage(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(movePage(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(movePage(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
  });

  it('weights overall progress by file size', () => {
    expect(overallProgress([])).toBe(0);
    expect(overallProgress([{ size: 100, sent: 0 }, { size: 300, sent: 0 }])).toBe(0);
    expect(overallProgress([{ size: 100, sent: 100 }, { size: 300, sent: 0 }])).toBe(0.25);
    expect(progressPercent([{ size: 100, sent: 100 }, { size: 300, sent: 300 }])).toBe(100);
    expect(progressPercent([{ size: 100, sent: 500 }])).toBe(100);
  });
});
