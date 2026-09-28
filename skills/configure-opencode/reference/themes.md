# Themes

Companion to [../SKILL.md](../SKILL.md). Format verified against
`https://opencode.ai/theme.json` and a working custom theme file.

## Choosing & activating

1. Pick a theme name — it becomes the **filename**:
   `~/.config/opencode/themes/<name>.json` (user-level, applies
   everywhere) or `.opencode/themes/<name>.json` (project-level).
2. Set `"theme": "<name>"` in `tui.json` (built-in theme names work the
   same way — no file needed).
3. Restart opencode; the TUI re-reads the theme at startup.

Removing a theme: unset/repoint `tui.json` `theme`, delete the JSON file,
restart.

## File format

```json
{
  "$schema": "https://opencode.ai/theme.json",
  "defs": {
    "bg": "#0D1017",
    "fg": "#BFBDB6",
    "accent": "#E6B450",
    "selection": "#3388FF40"
  },
  "theme": {
    "primary":    { "dark": "accent", "light": "accent" },
    "text":       { "dark": "fg", "light": "fg" },
    "background": { "dark": "bg", "light": "bg" }
  }
}
```

- `defs` — your own named color variables (any keys). Values: 6- or
  8-digit hex (trailing two digits = alpha), or any CSS color.
- `theme` — semantic slots; each slot is `{ "dark": …, "light": … }`
  referencing a `defs` name or a literal color. Both keys are required
  per slot even if identical.

## Slot catalog

| Group | Slots |
|---|---|
| Core | `primary`, `secondary`, `accent`, `error`, `warning`, `success`, `info`, `text`, `textMuted` |
| Surfaces | `background`, `backgroundPanel`, `backgroundElement`, `border`, `borderActive`, `borderSubtle` |
| Diff | `diffAdded`, `diffRemoved`, `diffContext`, `diffHunkHeader`, `diffHighlightAdded`, `diffHighlightRemoved`, `diffAddedBg`, `diffRemovedBg`, `diffContextBg`, `diffLineNumber`, `diffAddedLineNumberBg`, `diffRemovedLineNumberBg` |
| Markdown | `markdownText`, `markdownHeading`, `markdownLink`, `markdownLinkText`, `markdownCode`, `markdownBlockQuote`, `markdownEmph`, `markdownStrong`, `markdownHorizontalRule`, `markdownListItem`, `markdownListEnumeration`, `markdownImage`, `markdownImageText`, `markdownCodeBlock` |
| Syntax | `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation` |
| Input | `inputBackground`, `InputBorder`, `InputBorderActive`, `inputPrompt`, `inputCursor`, `inputText` |

Unspecified slots fall back to defaults — start with
core + surfaces + syntax, refine from there.

## Authoring workflow

1. Define palette in `defs` first (bg, editor bg, panel bg, fg, muted fg,
   accent, error, and one color per syntax role).
2. Map slots to defs — most slots point both dark and light at the same
   def; true dual themes diverge here.
3. Validate: `jq empty` on the file, restart, eyeball the TUI
   (backgrounds, diff view, markdown rendering, the input line).
4. Iterate: theme files reload on restart only — keep a scratch session
   for fast re-checks.

Sourcing themes from elsewhere: any opencode theme JSON works — save it
under `themes/` under your chosen name and activate as above.
