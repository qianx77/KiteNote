<!-- English posts. Replace <GitHub URL> before posting. Attach docs/images/*.png -->

# X / Twitter thread

**1/**
I built KiteNote: a desktop app that connects your daily to-do list to your work notes.

To Do–style tasks → one click → a WYSIWYG Markdown note linked to the task.
Plain .md files, works with your existing Obsidian vault. Open source.

<GitHub URL>
[note.png]

**2/**
The problem: my tasks lived in To Do, my experiment notes in Obsidian.
Every Friday I'd dig through both to answer "what did I actually do this week, and what did I learn?"

Now every task links to its note, and the note links back.
[today.png]

**3/**
WYSIWYG editing with a toolbar and a `/` menu: tables, callouts, LaTeX, code blocks, [[wikilinks]].
Tables get hover handles to insert, delete and align rows and columns in place.
It still saves as standard Markdown.
[table.png]

**4/**
Paste a screenshot → saved as an attachment.
Double-click → full-size viewer.
Copy a note into DingTalk / Lark / Word → images survive (inlined as base64).

**5/**
Obsidian compatible: [[links]], ![[embeds]], callouts, ==highlights==, math, and the Obsidian Tasks ⏫/✅ format.
No account, no cloud. Sync with whatever you already use (Syncthing, OneDrive, Git…).

**6/**
Electron + TipTap + markdown-it, MIT.
Windows builds for now; the UI is Chinese-only (an English UI is next).
Feedback and issues welcome 🙏
<GitHub URL>

---

# Show HN

**Title:** Show HN: KiteNote – daily tasks linked to WYSIWYG Markdown notes, Obsidian-compatible

**Text:**

I'm an ML engineer. My to-dos lived in Microsoft To Do and my experiment logs in Obsidian, so weekly reviews meant cross-referencing two apps by hand. KiteNote merges the two:

- To Do–style "My Day" and "This Week" views; tasks can have steps, notes and a "won't do" state with a reason.
- One click turns a task into a templated note (goal / method / log / results / conclusion), linked both ways.
- A WYSIWYG editor (TipTap/ProseMirror) that reads and writes Obsidian-flavored Markdown: wikilinks, embeds, callouts, highlights, math, and the Obsidian Tasks emoji format. Tasks are also plain Markdown files (one per day or week).
- Pasted images become attachments; copying out inlines images, so pasting into DingTalk, Lark or Word keeps them.

The hardest part was a lossless Markdown round-trip, so that opening and editing a note doesn't mangle an Obsidian vault. I tested it against ~60 of my own notes. A few equivalent forms still get normalized (escapes, table padding, list indentation), and the editor warns you before saving when that would happen.

No accounts and no server: the vault is a folder you sync however you like. Windows only for now, and the UI is Chinese (English is next). MIT.

<GitHub URL>

---

# Reddit r/ObsidianMD (check the subreddit's self-promotion rules first)

**Title:** I made a companion app that adds To Do–style daily/weekly tasks on top of an Obsidian vault (plain Markdown, Tasks-plugin compatible)

**Text:**

It opens your vault in place, with no import and no proprietary format. Tasks are stored as `- [ ] ... ⏫ ✅ 2026-10-27` lines in daily and weekly files, and each task can link to a note. The editor is WYSIWYG but saves Obsidian-flavored Markdown (wikilinks, embeds, callouts, math).

I'd love feedback from heavy Obsidian users: if any syntax you rely on gets changed on save, please open an issue with a sample.

<GitHub URL>
