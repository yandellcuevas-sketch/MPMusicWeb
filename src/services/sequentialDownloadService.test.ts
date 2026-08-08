import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadSequentially } from './sequentialDownloadService';
import { mediaRegistry } from './mediaAssetRegistry';

// Mock document.body.appendChild / removeChild / createElement
// and URL.createObjectURL / revokeObjectURL
const mockClick = vi.fn();
const mockAnchor = {
  href: '',
  download: '',
  style: { display: '' },
  click: mockClick,
};

// Track created / revoked ObjectURLs
const createdUrls: string[] = [];
const revokedUrls: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  createdUrls.length = 0;
  revokedUrls.length = 0;
  mediaRegistry.clear();

  // Stub createElement to return our mock anchor
  vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
  vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any);
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as any);

  // Stub URL methods
  vi.stubGlobal('URL', {
    createObjectURL: (_blob: Blob) => {
      const url = `blob:mock/${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => {
      revokedUrls.push(url);
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Helper to build a minimal CartItem-like object */
function makeItem(id: string, artist = 'Artist', title = 'Track', format = 'mp3') {
  return {
    id,
    source: 'local' as const,
    title,
    artist,
    artistNormalized: artist.toLowerCase(),
    duration: 200,
    outputFormat: format as any,
    quality: '320' as const,
    status: 'ready' as const,
    addedAt: Date.now(),
  };
}

describe('downloadSequentially', () => {
  it('downloads only items that have a processedBlob', async () => {
    const item1 = makeItem('id_1', 'Bad Bunny', 'Monaco');
    const item2 = makeItem('id_2', 'Feid', 'Classy 101');
    const item3 = makeItem('id_3', 'Jhayco', 'Ley Seca');

    // Register blob only for items 1 and 3
    mediaRegistry.registerProcessedBlob('id_1', new Blob(['audio1'], { type: 'audio/mpeg' }));
    mediaRegistry.registerProcessedBlob('id_3', new Blob(['audio3'], { type: 'audio/mpeg' }));

    const result = await downloadSequentially([item1, item2, item3], { intervalMs: 0 });

    expect(result.totalCount).toBe(2); // only blobs available
    expect(result.currentCount).toBe(2);
    expect(result.skippedCount).toBe(1); // item2 has no blob
    expect(result.errorCount).toBe(0);
    expect(result.completed).toBe(true);
    expect(mockClick).toHaveBeenCalledTimes(2);
  });

  it('creates and revokes an ObjectURL for each downloaded file', async () => {
    const item1 = makeItem('id_a', 'Rosalía', 'Despechá');
    const item2 = makeItem('id_b', 'Karol G', 'Provenza', 'wav');

    mediaRegistry.registerProcessedBlob('id_a', new Blob(['a']));
    mediaRegistry.registerProcessedBlob('id_b', new Blob(['b']));

    await downloadSequentially([item1, item2], { intervalMs: 0 });

    expect(createdUrls.length).toBe(2);
    // Every created URL must be revoked
    expect(revokedUrls).toEqual(expect.arrayContaining(createdUrls));
    expect(revokedUrls.length).toBe(2);
  });

  it('sets the download filename using sanitized artist - title.format', async () => {
    const item = makeItem('id_fn', 'Bad Bunny', 'Monaco', 'flac');
    mediaRegistry.registerProcessedBlob('id_fn', new Blob(['audio']));

    await downloadSequentially([item], { intervalMs: 0 });

    expect(mockAnchor.download).toBe('Bad Bunny - Monaco.flac');
  });

  it('reports progress correctly', async () => {
    const items = [
      makeItem('p1', 'A', 'Track 1'),
      makeItem('p2', 'B', 'Track 2'),
      makeItem('p3', 'C', 'Track 3'),
    ];

    for (const item of items) {
      mediaRegistry.registerProcessedBlob(item.id, new Blob(['x']));
    }

    const progressSnapshots: number[] = [];
    await downloadSequentially(items, {
      intervalMs: 0,
      onProgress: (p) => progressSnapshots.push(p.currentCount),
    });

    // Progress is reported once per file plus the initial 'Starting' call
    expect(progressSnapshots).toContain(1);
    expect(progressSnapshots).toContain(2);
    expect(progressSnapshots).toContain(3);
  });

  it('returns 100% complete when no files have blobs (edge case)', async () => {
    const item = makeItem('no_blob', 'X', 'Y');
    // No blob registered

    const result = await downloadSequentially([item], { intervalMs: 0 });

    expect(result.totalCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.completed).toBe(true);
    expect(result.progressPercentage).toBe(100);
    expect(mockClick).not.toHaveBeenCalled();
  });

  it('stops immediately when cancelRef is set before download starts', async () => {
    const items = [
      makeItem('c1', 'A', 'T1'),
      makeItem('c2', 'B', 'T2'),
    ];
    mediaRegistry.registerProcessedBlob('c1', new Blob(['x']));
    mediaRegistry.registerProcessedBlob('c2', new Blob(['x']));

    const cancelRef = { cancelled: true }; // Already cancelled

    const result = await downloadSequentially(items, { intervalMs: 0, cancelRef });

    // No files should be downloaded since cancelRef is pre-set
    expect(result.currentCount).toBe(0);
    expect(mockClick).not.toHaveBeenCalled();
  });

  it('stops mid-sequence when cancelRef is set during download', async () => {
    const items = [
      makeItem('mid1', 'A', 'T1'),
      makeItem('mid2', 'B', 'T2'),
      makeItem('mid3', 'C', 'T3'),
    ];
    for (const item of items) {
      mediaRegistry.registerProcessedBlob(item.id, new Blob(['x']));
    }

    const cancelRef = { cancelled: false };

    // Cancel after first file
    let progressCount = 0;
    await downloadSequentially(items, {
      intervalMs: 0,
      cancelRef,
      onProgress: (p) => {
        progressCount++;
        if (p.currentCount === 1) cancelRef.cancelled = true;
      },
    });

    // Should have downloaded exactly 1 file before cancellation
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('counts errors for files that fail during anchor click', async () => {
    const item = makeItem('err1', 'X', 'Y');
    mediaRegistry.registerProcessedBlob('err1', new Blob(['x']));

    // Make URL.createObjectURL throw
    vi.stubGlobal('URL', {
      createObjectURL: () => { throw new Error('objectURL creation failed'); },
      revokeObjectURL: vi.fn(),
    });

    const result = await downloadSequentially([item], { intervalMs: 0 });

    expect(result.errorCount).toBe(1);
    expect(result.currentCount).toBe(1); // Still counted as processed (even with error)
  });

  it('never produces a Blob with type text/plain (regression: old mock fallback)', async () => {
    const item = makeItem('no_plain', 'A', 'B');
    mediaRegistry.registerProcessedBlob('no_plain', new Blob(['real audio'], { type: 'audio/mpeg' }));

    let capturedBlob: Blob | null = null;
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:mock/test';
      },
      revokeObjectURL: vi.fn(),
    });

    await downloadSequentially([item], { intervalMs: 0 });

    expect(capturedBlob).not.toBeNull();
    expect((capturedBlob as Blob).type).not.toBe('text/plain');
    expect((capturedBlob as Blob).type).toBe('audio/mpeg');
  });
});
