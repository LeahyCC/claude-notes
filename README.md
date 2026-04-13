# claude-notes

A lightweight [MCP](https://modelcontextprotocol.io/) server that gives [Claude Code](https://docs.anthropic.com/en/docs/claude-code) persistent, project-based note-taking. Notes are stored as plain markdown files — one per project — so they're human-readable, version-controllable, and portable.

## Features

**Core note management**
- Add, update, delete, and search notes across projects
- Automatic timestamps and deduplication
- Organize notes into sections within each project

**Organization**
- Pin important notes to the top of a project
- Mark notes as done or archive them
- Rename, clear, or delete entire sections

**Discovery**
- Search across all projects by keyword, phrase, or `#tag`
- View recent notes across all projects
- Get a status snapshot of any project (note counts, blockers)

**Export**
- Generate a digest of notes from the last N days
- Export all notes (or a single project) to one markdown document

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/LeahyCC/claude-notes.git
cd claude-notes
npm install
```

### 2. Register with Claude Code

Add the server to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "claude-notes": {
      "command": "node",
      "args": ["/absolute/path/to/claude-notes/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/claude-notes/` with the actual path where you cloned the repo.

### 3. Custom storage location (optional)

By default, notes are stored in the `notes/` directory inside this repo. To store notes elsewhere — like a private git repo or a synced folder — set the `CLAUDE_NOTES_STORAGE` environment variable:

```json
{
  "mcpServers": {
    "claude-notes": {
      "command": "node",
      "args": ["/absolute/path/to/claude-notes/index.js"],
      "env": {
        "CLAUDE_NOTES_STORAGE": "/path/to/your/notes-repo"
      }
    }
  }
}
```

This lets you keep the server updatable (pull upstream changes) while storing notes in a separate private repo, a Dropbox/iCloud folder, or anywhere else on disk.

### 4. Start using it

Restart Claude Code and start adding notes:

> "Add a note to ProjectX under Bug Fixes: login redirect fails on Safari"

The `notes/` directory is created automatically on first use.

## How It Works

Each project gets a markdown file in the `notes/` directory:

```
notes/
├── ProjectX.md
├── Backend.md
└── archive/
    └── ProjectX.md    ← archived notes
```

A project file looks like:

```markdown
# ProjectX

_Last updated: Apr 13, 2026, 10:46 AM_

---

## Pinned
- [Apr 10] Launch date is May 1st

## Bug Fixes
- [Apr 13] Login redirect fails on Safari
- [Apr 12] Memory leak in websocket handler

## Done
- [Apr 11] ~~Fixed CSV export timeout~~
```

## Tool Reference

| Tool | Description |
|---|---|
| `add_note` | Add notes to a project section (auto-timestamped, deduplicated) |
| `get_notes` | Read all notes for a project |
| `list_projects` | List all project note files |
| `search_notes` | Search across all projects by keyword or #tag |
| `update_section` | Replace all notes in a section |
| `delete_note` | Remove a specific note by text |
| `delete_section` | Remove an entire section |
| `rename_section` | Rename a section heading |
| `archive_note` | Move a note to Done or to the archive file |
| `pin_note` | Pin a note to the top of a project |
| `get_pins` | Get all pinned notes across projects |
| `get_recent` | Get the most recently added notes |
| `get_status` | Project snapshot: counts, last updated, blockers |
| `nuke_project` | Delete an entire project file |
| `digest` | Summary of notes added in the last N days |
| `export_notes` | Export all notes (or one project) to markdown |

## Tips

### Shorthand with `cn`

You can teach Claude a quick shorthand by adding instructions to your project's `CLAUDE.md` file. For example:

```
When I type "cn <project>; <section>; <note text>", add a note using the claude-notes MCP server.
When I type "cn #todo <text>", add a todo to the _personal project under the Todos section.
```

Then you can just type:

```
cn Backend; bugs; API returns 500 on empty payload
cn #todo Review PR #42
```

### Tags

Include `#tags` in your notes to make them searchable:

```
cn ProjectX; risks; Vendor API has no SLA #blocker
```

Then search with: *"search my notes for #blocker"*

## License

MIT
