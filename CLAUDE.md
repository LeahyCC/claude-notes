# claude-notes MCP Server

This is a Model Context Protocol (MCP) server that provides persistent, project-based note-taking for Claude Code. Notes are stored as markdown files in the `notes/` directory by default, or in a custom directory set via the `CLAUDE_NOTES_STORAGE` environment variable.

## Setup

To register this MCP server with Claude Code, add the following to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "claude-notes": {
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_THIS_DIRECTORY/index.js"]
    }
  }
}
```

Run `npm install` in this directory if `node_modules/` doesn't exist yet.

To store notes in a custom location (e.g. a private git repo), add an `env` block:

```json
{
  "mcpServers": {
    "claude-notes": {
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_THIS_DIRECTORY/index.js"],
      "env": {
        "CLAUDE_NOTES_STORAGE": "/path/to/your/notes-directory"
      }
    }
  }
}
```

## Architecture

- `index.js` — single-file MCP server using `@modelcontextprotocol/sdk`, stdio transport
- `notes/` — default storage directory (auto-created), overridable via `CLAUDE_NOTES_STORAGE` env var
- `notes/archive/` — archived notes are moved here

## Key patterns

- Notes are stored as markdown bullet points under `## Section` headings
- Each note is auto-timestamped with `[Mon DD]` format
- Duplicate notes (same text, ignoring timestamp) are rejected
- Section ordering: Pinned always first, Done always last, everything else in insertion order
- Project file names are sanitized: non-alphanumeric characters (except `-` and `_`) become `_`
