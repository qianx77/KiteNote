# LabNote

**Connect your daily tasks to your work notes: To Do–style daily/weekly tasks, where every task can spawn a WYSIWYG, Obsidian-compatible Markdown note.**

Good for ML experiment logs, dev / debugging journals, project tracking, meeting notes and weekly reports — any work where *what you did, how, and what came out of it* is worth keeping.

[中文](README.md) · [Download](../../releases) · Everything is plain local `.md` files — open the same folder in Obsidian any time

![LabNote note view](docs/images/note.png)

## Why

I work in ML and kept switching between two apps: a to-do list for *what to do today*, and Obsidian for *how each thing was done and what came out of it* (mostly experiments, in my case). The pain points:

- Tasks and experiment notes live apart, so answering "what did I run this week, and what did I learn?" takes a lot of digging.
- Markdown syntax gets in the way — tables especially.
- Images and tables are lost when copying notes into DingTalk / Lark / Word for reports.

LabNote puts all three in one window **without inventing a new format**: tasks and notes are ordinary Markdown, so your existing Obsidian vault and sync setup keep working.

## Features

| | |
| --- | --- |
| **Daily / weekly tasks** | "My Day", "This Week", "Open tasks"; importance ⭐, sub-steps, notes, move to tomorrow, carry over yesterday's unfinished items, one-click weekly report |
| **Task → work note** | One click creates a note from a template (Goal / Method / Config / Log / Results / Conclusion) and links it to the task with a `[[wikilink]]`; the note links back |
| **WYSIWYG editing** | Toolbar + `/` menu for headings, colors, highlight, tables, callouts, code blocks, LaTeX math and `[[links]]` — no syntax to remember; switch to source mode any time |
| **Tables** | Hover handles on rows/columns to insert, delete and align in place; drag column widths; images inside cells |
| **Images** | Paste a screenshot and it is saved as an attachment; double-click to view the original (zoom, pan); **copy to DingTalk / Lark / Word with images intact** (inlined as base64) |
| **Outline** | Heading outline on the right; click to jump, highlights as you scroll |
| **Obsidian compatible** | Open an existing vault in place, or import it (byte-for-byte copy + SHA1 verification). Reads and writes `[[links]]`, `![[embeds]]`, callouts, `==highlight==`, math, and Obsidian Tasks' ⏫ / ✅. Moving or renaming a note updates links across the vault |
| **Sync** | The vault is just a folder: Baidu sync disk, Nutstore, OneDrive, Syncthing or Git all work; use the Obsidian mobile app on your phone |

| My Day | This Week |
| --- | --- |
| ![My Day](docs/images/today.png) | ![This Week](docs/images/week.png) |

| Table handles | Image viewer |
| --- | --- |
| ![Table](docs/images/table.png) | ![Viewer](docs/images/viewer.png) |

> The UI is currently Chinese-only. English UI is on the roadmap — contributions welcome.

## File format

```
vault/
├─ 任务/每日/2026-10-27.md    - [ ] distillation exp-012 ⏫ [[projects/ViT distill/2026-10-27 temperature]]
├─ 任务/每周/2026-W44.md      ⏫ = important, ✅ date = done (Obsidian Tasks compatible)
├─ projects/…                 ordinary Markdown notes
├─ attachments/               images, following .obsidian/app.json
└─ .labnote/settings.json     folder settings
```

Stop using LabNote and there is nothing to migrate: open the same folder in Obsidian or any editor.

## About "lossless"

- Opening a note without editing never rewrites the file; external changes (sync, Obsidian) reload automatically.
- After visual editing, content is preserved, but some **equivalent syntax is normalized** (e.g. redundant `\_` escapes, `|a|b|` → `| a | b |`, list indentation). The editor shows a warning chip when this would happen; use source mode to keep the original text.
- A table with custom column widths or merged cells is saved as an HTML table (rendered by Obsidian, but no longer editable as a Markdown table). "Reset column widths" turns it back into Markdown.

## Install

Windows installer and portable exe are on the Releases page. Builds are unsigned, so SmartScreen may warn on first launch ("Run anyway"). macOS / Linux builds are not tested yet.

## Development

Electron + React + TypeScript + TipTap (ProseMirror) + markdown-it.

```bash
npm install
npm run dev
npm test                      # task format, lossless Markdown round-trip, import, links, clipboard
npm run dist                  # Windows installer + portable exe in release/
node scripts/demo-shots.mjs   # regenerate docs/images from a fictional demo vault (after npm run build)
```

## License

MIT
