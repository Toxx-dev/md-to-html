# md-to-html

[![self-test](https://github.com/Toxx-dev/md-to-html/actions/workflows/test.yml/badge.svg)](https://github.com/Toxx-dev/md-to-html/actions/workflows/test.yml)

**A Markdown file becomes a page you can open in a tab.** One file, zero dependencies, no build step, no account. Run it, get a page, hand the page over.

```bash
node md-to-html.mjs --self-test
```

```text
md-to-html.mjs v1.2.1 — self-test

  PASS  a heading becomes an h1
  PASS  a soft-wrapped paragraph is joined
  PASS  bold
  PASS  italic
  PASS  bold holding italics
  ...
  29/29 passed
```

Then the thing you actually wanted:

```bash
node md-to-html.mjs notes.md --open
```

```text
md-to-html: /home/you/notes.md
  -> /home/you/notes.html  (24 KB)
  opened in the default browser
```

The page lands next to your file, with working links, real tables, and a dark look that reads well on a second screen.

## Getting it

```bash
git clone https://github.com/Toxx-dev/md-to-html.git
cd md-to-html

node md-to-html.mjs --self-test                       # 29/29 — proves itself before you trust it
node md-to-html.mjs examples/demo.md --out demo.html  # render the example, then open demo.html
```

Or put it on your PATH and forget about the clone:

```bash
npm install -g github:Toxx-dev/md-to-html
md-to-html notes.md --open
```

Node 18 or newer. There are no dependencies, so nothing else gets installed with it.

## Usage

```bash
node md-to-html.mjs "<file.md>"                    # writes <file>.html beside it
node md-to-html.mjs "<file.md>" --out page.html    # writes it where you say
node md-to-html.mjs "<file.md>" --open             # writes it, then opens it in your browser
node md-to-html.mjs --self-test
node md-to-html.mjs --help
node md-to-html.mjs --version
```

**Exit codes.** `0` when the page is written, and for `--help` and `--version`, because asking a question is not an error. `1` only when the self-test fails. `2` for a usage error, including a path that does not exist — you get a sentence, not a stack trace.

## What it supports

| shape | becomes |
|---|---|
| `# heading` … `###### heading` | `<h1>` … `<h6>` |
| a paragraph, soft-wrapped over lines | one `<p>`, the lines joined |
| `**bold**`, `*italic*`, `***both***` | `<strong>`, `<em>`, both |
| `` `inline code` `` | `<code>`, escaped, and nothing inside it is interpreted |
| a fenced block | `<pre><code>`, escaped |
| `[text](url)` and bare `https://…` | `<a href>` — the bare URL is linked for you |
| `![alt](img.png)` | `<img alt src>` |
| `[[a wikilink]]` or `[[page\|label]]` | `<span class="wl">`, as a plain name |
| `- item` and `1. item` | `<ul>` / `<ol>`, and **nested by indent** |
| `| a | b |` with a separator row | `<table>` with `<thead>` and `<tbody>` |
| `> quote` | `<blockquote>` |
| `---` | `<hr>` |
| YAML frontmatter at the top | dropped — tags and dates are metadata, not prose |

The output is one self-contained HTML file: the CSS is inline, there are no assets to copy, and it opens from a file path or a server without a network request.

## What it does not do

Being clear about this is the point — the tool is a small, honest subset, not a CommonMark implementation.

- **Not a full Markdown engine.** No HTML passthrough (a `<script>` in your text is escaped, not executed), no reference-style links, no footnotes, no task lists, no nested blockquotes, no smart-quote substitution.
- **No theme or configuration.** One dark look, inline. Edit the `page()` function if you want another.
- **Tables need a header row** — a separator line (`|---|---|`) after the first row. A table without one still renders, just without a `<thead>`.
- **Wikilinks are names, not links.** `[[A Note]]` renders as the text "A Note"; a browser cannot resolve a vault link.
- **It reads a file, not stdin.** Piping is not supported yet; give it a path.
- **A rendered page never writes back.** There is no round trip to Markdown.

## The tests

29 cases, and they are the argument. Every one is something this tool got wrong once.

The first real review of it found seven faults, each reproduced before a line was touched. Inline markup leaked into code spans — `` `a**b**` `` came out **bold**, because the code rule ran last. A double quote in a link URL walked out of the `href` attribute and wrote its own. `--out` with no value wrote a file literally named `true`, and `--out x.html draft.md` read `x.html` as the *source*, because the first argument without a leading `--` was taken as the file. Nested lists were flattened. The `<title>` carried the markdown itself. `--open` was hard-wired to Windows and crashed with an unhandled spawn error wherever no `cmd` existed.

All seven are fixed and all seven are cases. Then the command line got the same treatment: `--help` used to exit `2` like an error, and a missing file used to throw a Node stack trace. Both are answers now, both are cases.

**And the check that matters more than the count:** on a real 29 KB document with tables, code fences and dozens of links, the output is byte-identical to the version before the fixes. It changes nothing that was not broken.

## License

MIT. Take it, change it, ship it.
