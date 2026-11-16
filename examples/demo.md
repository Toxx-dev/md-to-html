# A draft, before the handoff

This is a Markdown file with the shapes a real document uses: **bold**, *italic*, `inline code`, a
soft-wrapped paragraph exactly like this one, and a [link](https://example.com).

## What a converter has to get right

- headings, one to six
- **bold**, *italic*, and ***both at once***
  - nested lists, unordered
  - a second one, under the first
- inline `code` and fenced code below
- [links](https://example.com) and bare URLs like https://example.com/bare
- tables, blockquotes, and rules

1. ordered lists
2. keep their numbers
3. and their order

| what | renders as |
|---|---|
| a table with a header | `<thead>` and `<tbody>` |
| a rule | `<hr>` |

> A blockquote keeps its words and loses its mark.

```js
// a fenced block is escaped, not executed
const compare = 1 < 2 && 3 > 2;
```

---

That is the whole subset. Anything outside it is left as text rather than mangled.
