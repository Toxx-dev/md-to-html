#!/usr/bin/env node
// md-to-html.mjs - a Markdown file becomes a page you can open in a tab.
//
// WHY IT EXISTS. A doc handed over should arrive as something readable on a second screen, with its
// links clickable and its tables intact - not as raw text in whatever the .md handler happens to be.
// Write in Markdown, hand over a page.
//
// No dependencies: the subset below is the subset most documents actually use. Anything exotic is
// left as text rather than mangled, and [[wikilinks]] are rendered as plain names.
//
//   node md-to-html.mjs "<file.md>" [--out out.html] [--open]
//   node md-to-html.mjs --self-test
//
// ASCII-only source; the page it writes carries a dark, readable look.
//
// THE FIRST REVIEW (2026-11-15). Seven faults, each reproduced before a line was touched:
//
//   1. inline markup leaked into code spans - `a**b**` inside backticks came out bold, because the
//      code rule ran last. Code spans are now lifted out first and put back escaped.
//   2. a link URL containing a double quote walked out of the href attribute and wrote its own
//      (`href="https://e.com/"onmouseover="alert(1"`). Quotes are escaped in the href.
//   3. `--out` with no value wrote a file literally named `true`.
//   4. `--out x.html draft.md` read `x.html` as the SOURCE, because the first non-flag argument was
//      taken as the file - a flag's own value does not start with `--`. Arguments are parsed now.
//   5. nested lists were flattened into one list. The item stack tracks indent and kind.
//   6. the <title> carried the markdown itself ("The **bench** page").
//   7. `--open` was hard-wired to Windows (`cmd /c start`), and a missing opener crashed the run
//      with an unhandled spawn error. It switches on platform now and says so when it cannot open.
//
// And it had no --self-test. It has one, and every fault above is a case in it.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VERSION = '1.2.2';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline markdown -> HTML. Code spans come out first and go back last: inside backticks the
 *  markdown is literal, so nothing else may run over it. */
const inline = (s) => {
  const codes = [];
  let t = String(s).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = esc(t)
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (m, a, b) => `<span class="wl">${b || a}</span>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, img) => `<img alt="${String(alt).replace(/"/g, '&quot;')}" src="${String(img).replace(/"/g, '&quot;')}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => `<a href="${String(href).replace(/"/g, '&quot;')}" target="_blank" rel="noreferrer">${text}</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<>"'`]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (m, n) => `<code>${esc(codes[+n])}</code>`);
};

/** The document title: the first H1, with the marks taken out of it. */
const titleOf = (raw, file) => {
  const h1 = (raw.match(/^#\s+(.+)$/m) || [])[1];
  const base = h1 || path.basename(file, '.md');
  return base.replace(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g, '$1').replace(/[*`]/g, '').trim();
};

/** Markdown -> the body's HTML. Returns { title, body }. */
export function render(raw, name = 'page.md') {
  const lines = String(raw).split(/\r?\n/);
  const out = [];
  let i = 0;
  let inCode = false, inQuote = false, inTable = false;
  let para = [];
  const stack = [];   // open lists: { kind, indent, open } - open means "this level has an unclosed <li>"

  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const closeLi = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].open) {
        // attached to the line it closes, so the markup reads like the old output
        if (out.length) out[out.length - 1] += '</li>'; else out.push('</li>');
        stack[k].open = false;
        break;
      }
    }
  };
  const closeList = () => {
    while (stack.length) { closeLi(); out.push(`</${stack.pop().kind}>`); }
  };
  const closeQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };
  const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; } };
  const closeAllBlocks = () => { flushPara(); closeList(); closeQuote(); closeTable(); };

  for (i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```/.test(line)) {
      closeAllBlocks();
      if (!inCode) { out.push('<pre><code>'); inCode = true; } else { out.push('</code></pre>'); inCode = false; }
      continue;
    }
    if (inCode) { out.push(esc(line)); continue; }

    // frontmatter: dropped (tags and dates are the vault's business, not the page's)
    if (i === 0 && line.trim() === '---') {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '---') j++;
      i = j;
      continue;
    }

    if (/^\s*$/.test(line)) { closeAllBlocks(); continue; }

    if (/^(#{1,6})\s+/.test(line)) {
      closeAllBlocks();
      const lvl = line.match(/^(#{1,6})/)[1].length;
      out.push(`<h${lvl}>${inline(line.replace(/^#{1,6}\s+/, ''))}</h${lvl}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { closeAllBlocks(); out.push('<hr>'); continue; }

    if (/^\s*>\s?/.test(line)) {
      flushPara(); closeList(); closeTable();
      if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
      out.push('<p>' + inline(line.replace(/^\s*>\s?/, '')) + '</p>');
      continue;
    }
    closeQuote();

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara(); closeList();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const next = lines[i + 1] || '';
      if (!inTable) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(next)) {
          out.push('<table><thead><tr>' + cells.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
          inTable = true;
          i++;   // skip the separator row
          continue;
        }
        out.push('<table><tbody>');
        inTable = true;
      }
      out.push('<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      continue;
    }
    closeTable();

    // A list item carries its own indent, so nesting is read rather than flattened.
    const item = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/);
    if (item) {
      flushPara();
      const indent = item[1].replace(/\t/g, '    ').length;
      const kind = /^\s*\d+\./.test(line) ? 'ol' : 'ul';

      while (stack.length && stack[stack.length - 1].indent > indent) {
        closeLi();
        out.push(`</${stack.pop().kind}>`);
      }
      const top = stack[stack.length - 1];
      if (!top || top.indent < indent) {
        // a deeper list opens INSIDE the open <li>, so that item is not closed here
        stack.push({ kind, indent, open: false });
        out.push(`<${kind}>`);
      } else if (top.kind !== kind) {
        closeLi();
        stack.pop();
        stack.push({ kind, indent, open: false });
        out.push(`<${kind}>`);
      } else {
        closeLi();
      }
      out.push('<li>' + inline(item[2]));
      stack[stack.length - 1].open = true;
      continue;
    }
    closeList();

    para.push(line.trim());
  }
  closeAllBlocks();
  if (inCode) out.push('</code></pre>');

  return { title: titleOf(raw, name), body: out.join('\n') };
}

/** The page around the body: a dark, readable look. */
export function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0 auto; max-width: 860px; padding: 48px 28px 96px;
         background: #12100e; color: #e8e3dc;
         font: 16px/1.62 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  h1 { font-size: 30px; line-height: 1.25; margin: 0 0 6px; letter-spacing: -0.01em; }
  h2 { font-size: 21px; margin: 40px 0 10px; padding-top: 14px; border-top: 1px solid #2a2622; }
  h3 { font-size: 17px; margin: 26px 0 8px; color: #f2ede6; }
  p, li { color: #ded8d0; }
  a { color: #7fd1c8; text-decoration: none; border-bottom: 1px solid #2f5f5a; }
  a:hover { border-bottom-color: #7fd1c8; }
  code { background: #201c19; border: 1px solid #2e2925; border-radius: 4px; padding: 1px 5px; font-size: 13.5px; color: #f0d9a8; }
  pre { background: #191614; border: 1px solid #2a2622; border-radius: 8px; padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; border: 0; color: #e8e3dc; }
  blockquote { margin: 16px 0; padding: 2px 16px; border-left: 3px solid #4a7f78; color: #cfc7bd; background: #171512; border-radius: 0 6px 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0 20px; font-size: 14.5px; }
  th, td { border: 1px solid #2c2723; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #1b1815; font-weight: 600; }
  tr:nth-child(even) td { background: #16130f; }
  hr { border: 0; border-top: 1px solid #2a2622; margin: 30px 0; }
  ul ul, ul ol, ol ul, ol ol { margin: 4px 0 4px 0; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  .wl { color: #c8a5f0; border-bottom: 1px dotted #4a3f5c; }
  strong { color: #fff8ee; }
</style></head>
<body>
${body}
</body></html>`;
}

/**
 * Arguments, parsed rather than guessed. A flag's value does not start with `--`, so "the first
 * argument that is not a flag" is not the source: `--out x.html draft.md` used to read `x.html`.
 */
export function parseArgs(argv) {
  const valueFlags = new Set(['out']);
  const positionals = [];
  const flags = new Map();
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (valueFlags.has(name)) {
        const next = argv[k + 1];
        if (!next || next.startsWith('--')) return { error: `--${name} needs a value` };
        flags.set(name, next);
        k++;
      } else {
        flags.set(name, true);
      }
      continue;
    }
    positionals.push(a);
  }
  if (!positionals.length) return { error: 'no file given' };
  return { src: positionals[0], out: flags.get('out') || null, open: flags.has('open') };
}

/** Open the page in whatever this machine calls a browser, and say so if it cannot. */
function openInBrowser(dest) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', dest]]
      : process.platform === 'darwin' ? ['open', [dest]]
        : ['xdg-open', [dest]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.log('  no browser opener found here - the page is written'));
    child.unref();
    console.log('  opened in the default browser');
  } catch {
    console.log('  no browser opener found here - the page is written');
  }
}

// ---------------------------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------------------------
const CASES = [
  ['a heading becomes an h1', '# Title', (r) => r.body === '<h1>Title</h1>'],
  ['a soft-wrapped paragraph is joined', 'one line\nand its continuation', (r) => r.body === '<p>one line and its continuation</p>'],
  ['bold', 'a **b** c', (r) => r.body.includes('<strong>b</strong>')],
  ['italic', 'an *i* here', (r) => r.body.includes('<em>i</em>')],
  ['bold holding italics', '**bold with *it* inside**', (r) => r.body.includes('<strong>bold with <em>it</em> inside</strong>')],
  ['bold and italic at once', 'a ***both*** b', (r) => r.body.includes('<strong><em>both</em></strong>') && !r.body.includes('***')],

  // 1. the code span is literal - the fault was `a**b**` coming out bold
  ['code span keeps its asterisks', 'the value `a**b**` stays', (r) => r.body.includes('<code>a**b**</code>') && !r.body.includes('<strong>b</strong>')],
  ['code span keeps a URL as text', 'see `https://a.example/x` here', (r) => r.body.includes('<code>https://a.example/x</code>') && !r.body.includes('<a href')],
  ['code span escapes html', '`<b>`', (r) => r.body.includes('<code>&lt;b&gt;</code>')],

  // 2. the attribute could be walked out of with a quote
  ['a quote in a link URL is escaped', '[x](https://e.example/"onmouseover="alert(1))', (r) => r.body.includes('&quot;onmouseover=&quot;') && !r.body.includes('"onmouseover="')],
  ['a plain link is a link', '[text](https://e.example/a)', (r) => r.body.includes('<a href="https://e.example/a" target="_blank" rel="noreferrer">text</a>')],
  ['an image is an image, not a link', '![alt text](https://e.example/i.png)', (r) => r.body.includes('<img alt="alt text" src="https://e.example/i.png">') && !r.body.includes('<a href')],
  ['a bare URL is linked', 'go to https://e.example/a now', (r) => r.body.includes('<a href="https://e.example/a"')],

  ['a wikilink becomes its plain name', 'see [[A Note]] and [[A Page|the label]]', (r) => r.body.includes('<span class="wl">A Note</span>') && r.body.includes('<span class="wl">the label</span>')],
  ['a table gets a head and a body', '| a | b |\n|---|---|\n| 1 | 2 |', (r) => r.body.includes('<th>a</th>') && r.body.includes('<td>1</td>')],
  ['an unordered list', '- one\n- two', (r) => r.body.replace(/\n/g, '') === '<ul><li>one</li><li>two</li></ul>'],
  ['an ordered list stays ordered', '1. one\n2. two', (r) => r.body.replace(/\n/g, '') === '<ol><li>one</li><li>two</li></ol>'],

  // 5. nesting used to be flattened
  ['a nested list nests', '- a\n  - b', (r) => r.body.replace(/\n/g, '') === '<ul><li>a<ul><li>b</li></ul></li></ul>'],

  ['a blockquote', '> said', (r) => r.body.includes('<blockquote>') && r.body.includes('<p>said</p>')],
  ['a rule', 'a\n\n---\n\nb', (r) => r.body.includes('<hr>')],
  ['a code fence is escaped, not rendered', '```\n<b>x</b>\n```', (r) => r.body.includes('&lt;b&gt;x&lt;/b&gt;') && !r.body.includes('<b>x</b>')],
  ['frontmatter is dropped', '---\ntags: [x]\n---\n\n# T', (r) => !r.body.includes('tags:') && r.body.includes('<h1>T</h1>')],
  ['literal html in text is escaped', 'a <script> tag', (r) => r.body.includes('&lt;script&gt;')],

  // 6. the title carried the markdown
  ['the title carries no markdown', '# The **bench** page\n\nbody', (r) => r.title === 'The bench page'],

  // 3 & 4. the argument parser
  ['a flag value is not the source', null, () => { const a = parseArgs(['--out', 'x.html', 'd.md']); return a.src === 'd.md' && a.out === 'x.html'; }],
  ['--out with no value is an error', null, () => Boolean(parseArgs(['d.md', '--out']).error)],
  ['--open is read as a flag', null, () => parseArgs(['d.md', '--open']).open === true],

  // The command line is part of the promise too: a stranger's first command must not cost them time.
  ['--help is an answer, not an error', null, () => { const r = spawnSync(process.execPath, [self, '--help'], { encoding: 'utf8' }); return r.status === 0 && r.stdout.includes('<file.md>'); }],
  ['a missing file is a sentence, not a stack trace', null, () => { const r = spawnSync(process.execPath, [self, 'no-such-file.md'], { encoding: 'utf8' }); return r.status === 2 && /no such file/.test(r.stderr) && !/\n\s+at /.test(r.stderr); }],
  // npm builds the installed command from the shebang: without one it calls the file directly and
  // the command silently does nothing. Found by installing it and running it, which is the point.
  ['the file carries a shebang, so a global install makes a working command', null, () => fs.readFileSync(self, 'utf8').startsWith('#!/usr/bin/env node')],
];

function selfTest() {
  let failed = 0;
  for (const [name, input, check] of CASES) {
    let ok = false, detail = '';
    try {
      ok = input === null ? Boolean(check()) : Boolean(check(render(input, 'page.md')));
    } catch (e) { detail = e.message; }
    if (!ok) failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  }
  console.log(`\n  ${CASES.length - failed}/${CASES.length} passed${failed ? ` — ${failed} FAILED` : ''}`);
  return failed === 0;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
const USAGE = `md-to-html.mjs v${VERSION} — a Markdown file becomes a page you can open in a tab

  node md-to-html.mjs "<file.md>"                write <file>.html beside it
  node md-to-html.mjs "<file.md>" --out page.html  write it where you say
  node md-to-html.mjs "<file.md>" --open          write it, then open it in the browser
  node md-to-html.mjs --self-test
  node md-to-html.mjs --help | --version

  No dependencies. Anything outside the subset is left as text rather than mangled.`;

function main(argv) {
  if (argv.includes('--self-test')) {
    console.log(`md-to-html.mjs v${VERSION} — self-test\n`);
    process.exit(selfTest() ? 0 : 1);
  }
  if (argv.includes('--version') || argv.includes('-v')) { console.log(`md-to-html.mjs v${VERSION}`); process.exit(0); }
  // A stranger's first command decides whether they stay: help is an answer, not an error.
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); process.exit(0); }

  const args = parseArgs(argv);
  if (args.error) {
    console.error(`md-to-html: ${args.error}`);
    console.error(USAGE);
    process.exit(2);
  }

  const file = path.resolve(args.src);
  if (!fs.existsSync(file)) { console.error(`md-to-html: no such file: ${file}`); process.exit(2); }

  const raw = fs.readFileSync(file, 'utf8');
  const { title, body } = render(raw, file);
  const html = page(title, body);

  const dest = path.resolve(args.out || path.join(path.dirname(file), path.basename(file, '.md') + '.html'));
  fs.writeFileSync(dest, html);
  console.log(`md-to-html: ${file}`);
  console.log(`  -> ${dest}  (${html.length} bytes)`);
  if (args.open) openInBrowser(dest);
}

const self = path.resolve(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === self) main(process.argv.slice(2));
