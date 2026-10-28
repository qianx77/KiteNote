# KiteNote

**Connect your daily tasks to your work notes: To Do–style daily/weekly tasks, where every task can spawn a WYSIWYG, Obsidian-compatible Markdown note.**

Good for ML experiment logs, dev / debugging journals, project tracking, meeting notes and weekly reports — any work where *what you did, how, and what came out of it* is worth keeping.

[中文](README.md) · [Download](../../releases) · Everything is plain local `.md` files — open the same folder in Obsidian any time

![KiteNote note view](docs/images/note.png)

## Why

I work in ML and kept switching between two apps: a to-do list for *what to do today*, and Obsidian for *how each thing was done and what came out of it* (mostly experiments, in my case). The pain points:

- **Tables are painful:** in Obsidian you type `| --- |` by hand, and adding a column is a chore.
- **Images don't copy out:** screenshots and charts are lost when pasting a note into DingTalk / Lark / Word for a report.
- **No weekly report:** tasks and notes live apart, so answering "what did I do this week, and what did I learn?" means digging through both.

KiteNote puts all three in one window **without inventing a new format**: tasks and notes are ordinary Markdown, so your existing Obsidian vault and sync setup keep working.

## Highlights

- **Tasks linked to notes, weekly report in one click:** every task can own a work note; "Copy weekly report" gathers this week's goals, each day's tasks and status, linked notes, remarks and a completion count, ready to paste.
- **Tables you edit like Word:** hover handles to insert, delete and align rows and columns, drag column widths, put images in cells — still saved as Markdown.
- **Copy to DingTalk / Lark / Word with images intact:** images are inlined into the clipboard.
- **Zero migration:** open your existing Obsidian vault in place; stop using KiteNote and there is nothing to export.
- **Sync-drive friendly:** if another computer changed a file while you were editing, KiteNote won't overwrite it — your version is saved as a conflict copy and you're told.
- **Local, open source, no account:** your data stays in your own folder; there is no server.

## Compared with common tools

| | KiteNote | Obsidian | Notion / Lark Docs | Microsoft To Do / TickTick |
| --- | --- | --- | --- | --- |
| Where data lives | Local Markdown | Local Markdown | Cloud | Cloud |
| Editing tables | WYSIWYG, hover handles, drag widths | Limited visual editing; often raw syntax or plugins | WYSIWYG | — |
| Daily / weekly tasks | Built in | Via Tasks / TaskNotes plugins | Build your own database or template | Built in |
| Task ↔ note link | One click, both directions | Plugins + manual links | Manual | Plain notes only |
| Copy to DingTalk with images | Images inlined | Images are local paths, lost on paste | Cloud links, depends on permissions | — |
| Weekly report | One click | No | Custom template | No |
| Account | None | None (paid official sync) | Required | Required |

<sub>Based on each tool's default features as of October 2026. Corrections welcome.</sub>

## Features

| | |
| --- | --- |
| **Daily / weekly tasks** | "My Day", "This Week", "Open tasks"; importance ⭐, sub-steps, notes, move to tomorrow, carry over yesterday's unfinished items, one-click weekly report |
| **Task → work note** | One click, pick a template, and a note is created and linked to the task with a `[[wikilink]]`; the note links back |
| **Templates** | Built-in templates: Experiment / Troubleshooting / Meeting / General work log. Every note in the vault's template folder is a template (same name overrides a built-in; honors Obsidian's Templates folder setting). Supports `{{title}}` `{{date}}` `{{time}}` `{{date:YYYY-MM-DD}}` |
| **WYSIWYG editing** | Toolbar + `/` menu for headings, colors, highlight, tables, callouts, code blocks, LaTeX math and `[[links]]` — no syntax to remember; switch to source mode any time |
| **Tables** | Hover handles on rows/columns to insert, delete and align in place; drag column widths; images inside cells |
| **Images** | Paste a screenshot and it is saved as an attachment; double-click to view the original (zoom, pan); **copy to DingTalk / Lark / Word with images intact** (inlined as base64) |
| **Outline** | Heading outline on the right; click to jump, highlights as you scroll |
| **Obsidian compatible** | Open an existing vault in place, or import it (byte-for-byte copy + SHA1 verification). Reads and writes `[[links]]`, `![[embeds]]`, callouts, `==highlight==`, math, and Obsidian Tasks' ⏫ / ✅. Moving or renaming a note updates links across the vault |
| **Sync** | The vault is just a folder: Baidu sync disk, Nutstore, OneDrive, Syncthing or Git all work; use the Obsidian mobile app on your phone. Files changed on another device are never overwritten — your version becomes a conflict copy |

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
└─ .kitenote/settings.json     folder settings
```

Stop using KiteNote and there is nothing to migrate: open the same folder in Obsidian or any editor.

## About "lossless"

- Opening a note without editing never rewrites the file; external changes (sync, Obsidian) reload automatically. If a file changes on disk while you are editing it, saving does not overwrite it; your version is saved as a conflict copy instead.
- After visual editing, content is preserved, but some **equivalent syntax is normalized** (e.g. redundant `\_` escapes, `|a|b|` → `| a | b |`, list indentation). The editor shows a warning chip when this would happen; use source mode to keep the original text.
- A table with custom column widths or merged cells is saved as an HTML table (rendered by Obsidian, but no longer editable as a Markdown table). "Reset column widths" turns it back into Markdown.

## Install

Windows installer and portable exe are on the Releases page. Builds are unsigned, so SmartScreen may warn on first launch ("Run anyway"). macOS / Linux builds are not tested yet.

## Development

Electron + React + TypeScript + TipTap (ProseMirror) + markdown-it.

```bash
npm install
npm run dev
npm test                      # task format, lossless Markdown round-trip, import, links, clipboard, sync conflicts
npm run dist                  # Windows installer + portable exe in release/
node scripts/demo-shots.mjs   # regenerate docs/images from a fictional demo vault (after npm run build)
```

## License

Copyright © 2026 qianx77 · [AGPL-3.0](LICENSE)

- Free to use, modify and redistribute.
- If you distribute a modified version or offer it as a network service, you must publish the complete source under the same license.
- For a closed-source or commercial license, contact qianx77@126.com.

Contributions are welcome. To keep commercial licensing possible, you will be asked to sign a Contributor License Agreement (CLA) before a PR is merged.
