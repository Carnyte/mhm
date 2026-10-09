// The allowlist sanitizer for HTML from outside the app (AO3 / Wattpad chapters, imported files):
// hostile markup comes out inert, ordinary story formatting survives.

import { sanitizeHtml } from '../src/html/sanitize';

describe('sanitizeHtml: keeps story formatting', () => {
  it('keeps paragraphs, emphasis, breaks, rules, headings, lists and quotes', () => {
    const html =
      '<h2 align="center">Chapter 1</h2><p>She said <em>no</em>, <strong>twice</strong>.<br>Then <i>left</i>.</p><hr><blockquote><p>A quote</p></blockquote><ul><li>one</li><li>two</li></ul><ol start="3"><li>three</li></ol>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('keeps tables, images, safe links and AO3-style alignment', () => {
    expect(sanitizeHtml('<table border="1"><tbody><tr><td colspan="2" align="center">x</td></tr></tbody></table>')).toBe(
      '<table border="1"><tbody><tr><td colspan="2" align="center">x</td></tr></tbody></table>',
    );
    expect(sanitizeHtml('<p align="center"><img src="https://img.wattpad.com/x.jpg" alt="Map" width="300"></p>')).toBe(
      '<p align="center"><img src="https://img.wattpad.com/x.jpg" alt="Map" width="300"></p>',
    );
    expect(sanitizeHtml('<a href="https://archiveofourown.org/works/1">link</a> <a href="#note1" name="ref1">1</a> <a href="/works/2">rel</a>')).toBe(
      '<a href="https://archiveofourown.org/works/1">link</a> <a href="#note1" name="ref1">1</a> <a href="/works/2">rel</a>',
    );
  });

  it('keeps a small set of inline styles', () => {
    expect(sanitizeHtml('<p style="text-align: center; color: red; font-style:italic">x</p>')).toBe('<p style="text-align: center; font-style: italic">x</p>');
    expect(sanitizeHtml('<p style="text-align:center">x</p>', { styles: 'none' })).toBe('<p>x</p>');
    expect(sanitizeHtml('<span style="color:red">x</span>')).toBe('<span>x</span>');
  });

  it('keeps attributes the caller asks for (Wattpad paragraph ids)', () => {
    expect(sanitizeHtml('<p data-p-id="ab12" data-x="1">x</p>', { keepAttrs: ['data-p-id'] })).toBe('<p data-p-id="ab12">x</p>');
    expect(sanitizeHtml('<p data-p-id="ab12">x</p>')).toBe('<p>x</p>');
  });

  it('keeps text exactly, escaping what needs escaping', () => {
    expect(sanitizeHtml('<p>Fish &amp; chips &lt;3 “quoted” — é</p>')).toBe('<p>Fish &amp; chips &lt;3 “quoted” — é</p>');
    expect(sanitizeHtml('plain text')).toBe('plain text');
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('sanitizeHtml: hostile markup', () => {
  it.each([
    ['<p>a<script>alert(1)</script>b</p>', '<p>ab</p>'],
    ['<p>a<SCRIPT SRC=//evil.js></SCRIPT>b</p>', '<p>ab</p>'],
    ['<style>body{display:none}</style><p>x</p>', '<p>x</p>'],
    ['<p onclick="steal()" onmouseover=x>x</p>', '<p>x</p>'],
    ['<img src=x onerror="alert(1)">', '<img src="x">'],
    ['<a href="javascript:alert(1)">x</a>', '<a>x</a>'],
    ['<a href="JaVaScRiPt:alert(1)">x</a>', '<a>x</a>'],
    ['<a href=" java\tscript:alert(1)">x</a>', '<a>x</a>'],
    ['<a href="&#106;avascript:alert(1)">x</a>', '<a>x</a>'],
    ['<a href="vbscript:msgbox(1)">x</a>', '<a>x</a>'],
    ['<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', '<a>x</a>'],
    ['<img src="data:image/svg+xml;base64,PHN2Zz4=">', '<img>'],
    ['<img src="javascript:alert(1)">', '<img>'],
    ['<a href="https://ok.example/" target="_blank" rel="opener">x</a>', '<a href="https://ok.example/">x</a>'],
    ['<base href="https://evil.example/"><a href="/x">x</a>', '<a href="/x">x</a>'],
    ['<meta http-equiv="refresh" content="0;url=https://evil.example"><p>x</p>', '<p>x</p>'],
    ['<link rel="stylesheet" href="https://evil.example/x.css"><p>x</p>', '<p>x</p>'],
    ['<iframe src="https://evil.example" srcdoc="<script>1</script>"></iframe><p>x</p>', '<p>x</p>'],
    ['<object data="x.swf"><embed src="x.swf"></object><p>x</p>', '<p>x</p>'],
    ['<svg onload="alert(1)"><script>alert(1)</script><a xlink:href="javascript:1">x</a></svg><p>y</p>', '<p>y</p>'],
    ['<math><mi xlink:href="javascript:alert(1)">x</mi></math><p>y</p>', '<p>y</p>'],
    ['<form action="https://evil.example"><p>Name</p><input name="pw" type="password"><button formaction="x">Go</button></form>', '<p>Name</p>'],
    ['<textarea><p>x</p></textarea><select><option>1</option></select>z', 'z'],
    ['<video src="x.mp4" autoplay></video><audio src="y"></audio>z', 'z'],
    ['<p style="background:url(javascript:alert(1))">x</p>', '<p>x</p>'],
    ['<p style="width: expression(alert(1))">x</p>', '<p>x</p>'],
    ['<p style="text-align: center; behavior: url(x.htc)">x</p>', '<p style="text-align: center">x</p>'],
    ['<!-- <script>alert(1)</script> --><p>x</p>', '<p>x</p>'],
    ['<![CDATA[<script>alert(1)</script>]]><p>x</p>', '<p>x</p>'],
    ['<noscript><p>x</p></noscript><template><p>y</p></template>z', 'z'],
  ])('%s', (input, expected) => {
    expect(sanitizeHtml(input)).toBe(expected);
  });

  it('unwraps unknown and structural tags, keeping their text', () => {
    expect(sanitizeHtml('<html><head><title>T</title></head><body><o:p>Word</o:p><custom-el x="1">text</custom-el></body></html>')).toBe('Wordtext');
    expect(sanitizeHtml('<main><nav>Menu</nav><p>Body</p></main>')).toBe('Menu<p>Body</p>');
  });

  it('removes ids and classes the reader page uses itself', () => {
    expect(sanitizeHtml('<p id="next" class="tts note fs-notes">x</p><p id="footnote-1" class="note">y</p>')).toBe('<p class="note">x</p><p id="footnote-1" class="note">y</p>');
    expect(sanitizeHtml('<div id="end"><span class="end">z</span></div>')).toBe('<div><span>z</span></div>');
  });

  it('flattens hostile nesting instead of overflowing the stack', () => {
    const deep = '<div>'.repeat(5000) + 'core' + '</div>'.repeat(5000);
    const out = sanitizeHtml(deep);
    expect(out).toContain('core');
    expect((out.match(/<div>/g) ?? []).length).toBeLessThanOrEqual(120);
  });

  it('never lets an attribute value break out', () => {
    expect(sanitizeHtml('<p title=\'a" onclick="x\'>x</p>')).toBe('<p title="a&quot; onclick=&quot;x">x</p>');
    expect(sanitizeHtml('<img alt="<script>alert(1)</script>">')).toBe('<img alt="<script>alert(1)</script>">');
  });
});

describe('sanitizeHtml: review fixes', () => {
  it.each(['&nbsp;', '&#xFEFF;', '&#x2028;', '&#x3000;', '\t', ' '])('drops a dangerous scheme hidden behind %j', (pad) => {
    for (const url of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'ficshelf://open?url=x', 'file:///etc/hosts']) {
      const out = sanitizeHtml(`<a href="${pad}${url}">x</a><img src="${pad}${url}">`);
      expect(out).not.toMatch(/javascript:|data:text|ficshelf:|file:/);
    }
  });

  it('still keeps ordinary links, trimmed', () => {
    expect(sanitizeHtml('<a href="&nbsp;https://example.com/a ">x</a>')).toBe('<a href="https://example.com/a">x</a>');
  });

  it('treats tags named after object members as unknown, without throwing', () => {
    expect(sanitizeHtml('<constructor foo="1">x</constructor><toString>y</toString>')).toBe('xy');
  });

  it('copes with a body holding a huge number of paragraphs', () => {
    const html = '<html><body>' + '<p>x</p>\n'.repeat(150_000) + '</body></html>';
    expect(() => sanitizeHtml(html)).not.toThrow();
  });
});
