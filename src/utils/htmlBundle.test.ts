import { beforeEach, describe, expect, it, vi } from 'vitest';

// The bundler pulls every local resource through readWorkspaceFileBase64.
// Back it with an in-memory file table keyed by workspace-relative path so
// we can assert on path resolution, inlining, and graceful failure.
const mockRead = vi.hoisted(() => vi.fn());
vi.mock('../workspace/client', () => ({ readWorkspaceFileBase64: mockRead }));

import {
  bundleHtmlForPreview,
  isWorkspaceRelativeHref,
  resolveWorkspacePath,
} from './htmlBundle';

// Test fixtures are ASCII, so btoa is an adequate (and tsc-clean) base64.
const b64 = (text: string): string => btoa(text);

// path -> { mime, text } | { mime, base64 } for binaries
type Entry = { mime: string; text?: string; base64?: string };

const seedFiles = (files: Record<string, Entry>) => {
  mockRead.mockImplementation(async (_workspaceId: string, path: string) => {
    const entry = files[path];
    if (!entry) throw new Error(`File not found: ${path}`);
    return {
      path,
      mime: entry.mime,
      base64: entry.base64 ?? b64(entry.text ?? ''),
    };
  });
};

beforeEach(() => {
  mockRead.mockReset();
});

describe('bundleHtmlForPreview', () => {
  it('inlines a relative stylesheet into a <style> tag', async () => {
    seedFiles({
      'reports/assets/style.css': { mime: 'text/css', text: 'body { color: red; }' },
    });
    const html = '<html><head><link rel="stylesheet" href="assets/style.css"></head><body>hi</body></html>';

    const out = await bundleHtmlForPreview('ws', 'reports/2026-05-31.html', html);

    expect(out).toContain('<style>body { color: red; }</style>');
    expect(out).not.toContain('<link');
    expect(mockRead).toHaveBeenCalledWith('ws', 'reports/assets/style.css');
  });

  it('resolves ../ references against the HTML file directory', async () => {
    seedFiles({
      'shared/base.css': { mime: 'text/css', text: '.x{}' },
    });
    const html = '<link rel="stylesheet" href="../shared/base.css">';

    await bundleHtmlForPreview('ws', 'reports/page.html', html);

    expect(mockRead).toHaveBeenCalledWith('ws', 'shared/base.css');
  });

  it('inlines images referenced by relative src as data URIs', async () => {
    seedFiles({
      'reports/logo.png': { mime: 'image/png', base64: 'QUJD' }, // "ABC"
    });
    const html = '<img src="logo.png">';

    const out = await bundleHtmlForPreview('ws', 'reports/page.html', html);

    expect(out).toContain('src="data:image/png;base64,QUJD"');
  });

  it('inlines url() and recursive @import inside CSS, relative to the CSS file', async () => {
    seedFiles({
      'reports/assets/main.css': {
        mime: 'text/css',
        text: '@import "theme.css"; .hero { background: url(img/bg.png); }',
      },
      'reports/assets/theme.css': { mime: 'text/css', text: 'body{margin:0}' },
      'reports/assets/img/bg.png': { mime: 'image/png', base64: 'QUJD' },
    });
    const html = '<link rel="stylesheet" href="assets/main.css">';

    const out = await bundleHtmlForPreview('ws', 'reports/page.html', html);

    expect(out).toContain('body{margin:0}'); // @import inlined
    expect(out).toContain('url("data:image/png;base64,QUJD")'); // url() resolved under assets/img
    expect(mockRead).toHaveBeenCalledWith('ws', 'reports/assets/theme.css');
    expect(mockRead).toHaveBeenCalledWith('ws', 'reports/assets/img/bg.png');
  });

  it('leaves absolute and remote references untouched', async () => {
    seedFiles({});
    const html = [
      '<link rel="stylesheet" href="https://cdn.example.com/x.css">',
      '<img src="/root/abs.png">',
      '<img src="data:image/gif;base64,AA==">',
      '<a href="#section">jump</a>',
    ].join('');

    const out = await bundleHtmlForPreview('ws', 'reports/page.html', html);

    expect(out).toContain('href="https://cdn.example.com/x.css"');
    expect(out).toContain('src="/root/abs.png"');
    expect(out).toContain('data:image/gif;base64,AA==');
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('keeps the original reference when a resource fails to load', async () => {
    seedFiles({}); // every read throws "not found"
    const html = '<link rel="stylesheet" href="missing.css"><img src="gone.png">';

    const out = await bundleHtmlForPreview('ws', 'reports/page.html', html);

    expect(out).toContain('href="missing.css"');
    expect(out).toContain('src="gone.png"');
  });

  it('strips ?query / #fragment when resolving but inlines the asset', async () => {
    seedFiles({
      'reports/assets/font.woff2': { mime: 'font/woff2', base64: 'QUJD' },
    });
    const html = '<style>@font-face{src:url(assets/font.woff2?v=2)}</style>';

    const out = await bundleHtmlForPreview('ws', 'reports/page.html', html);

    expect(out).toContain('url("data:font/woff2;base64,QUJD")');
    expect(mockRead).toHaveBeenCalledWith('ws', 'reports/assets/font.woff2');
  });

  it('reads each distinct path once even when referenced repeatedly', async () => {
    seedFiles({
      'reports/a.png': { mime: 'image/png', base64: 'QUJD' },
    });
    const html = '<img src="a.png"><img src="a.png"><img src="a.png">';

    await bundleHtmlForPreview('ws', 'reports/page.html', html);

    const readsOfA = mockRead.mock.calls.filter((c) => c[1] === 'reports/a.png');
    expect(readsOfA).toHaveLength(1);
  });
});

describe('resolveWorkspacePath', () => {
  it('resolves a sibling link against the current file directory', () => {
    expect(resolveWorkspacePath('reports/index.html', '2026-05-31.html')).toBe(
      'reports/2026-05-31.html',
    );
  });

  it('handles ./ and ../ and nested segments', () => {
    expect(resolveWorkspacePath('reports/index.html', './a.html')).toBe('reports/a.html');
    expect(resolveWorkspacePath('reports/index.html', '../top.html')).toBe('top.html');
    expect(resolveWorkspacePath('reports/index.html', 'sub/deep.html')).toBe('reports/sub/deep.html');
  });

  it('strips query and fragment', () => {
    expect(resolveWorkspacePath('reports/index.html', '2026-05-31.html?v=2#top')).toBe(
      'reports/2026-05-31.html',
    );
  });

  it('treats a leading slash as workspace-root-relative', () => {
    expect(resolveWorkspacePath('reports/sub/page.html', '/reports/index.html')).toBe(
      'reports/index.html',
    );
  });

  it('returns empty for an empty or hash-only href', () => {
    expect(resolveWorkspacePath('reports/index.html', '')).toBe('');
    expect(resolveWorkspacePath('reports/index.html', '#section')).toBe('');
  });
});

describe('isWorkspaceRelativeHref', () => {
  it('accepts relative and root-absolute paths', () => {
    expect(isWorkspaceRelativeHref('ARCHITECTURE.md')).toBe(true);
    expect(isWorkspaceRelativeHref('./docs/x.md')).toBe(true);
    expect(isWorkspaceRelativeHref('../top.md')).toBe(true);
    expect(isWorkspaceRelativeHref('/reports/index.html')).toBe(true);
  });

  it('rejects external links, anchors, and empties', () => {
    expect(isWorkspaceRelativeHref('https://example.com')).toBe(false);
    expect(isWorkspaceRelativeHref('mailto:a@b.com')).toBe(false);
    expect(isWorkspaceRelativeHref('//cdn.example.com/x')).toBe(false);
    expect(isWorkspaceRelativeHref('#section')).toBe(false);
    expect(isWorkspaceRelativeHref('')).toBe(false);
    expect(isWorkspaceRelativeHref(null)).toBe(false);
  });
});
