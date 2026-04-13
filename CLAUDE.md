# claude-notes MCP Server

This is a Model Context Protocol (MCP) server that provides persistent, project-based note-taking for Claude Code. Notes are stored as markdown files in the `notes/` directory.

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

## Architecture

- `index.js` — single-file MCP server using `@modelcontextprotocol/sdk`, stdio transport
- `notes/` — auto-created directory where project markdown files are stored (one file per project)
- `notes/archive/` — archived notes are moved here

## Key patterns

- Notes are stored as markdown bullet points under `## Section` headings
- Each note is auto-timestamped with `[Mon DD]` format
- Duplicate notes (same text, ignoring timestamp) are rejected
- Section ordering: Pinned always first, Done always last, everything else in insertion order
- Project file names are sanitized: non-alphanumeric characters (except `-` and `_`) become `_`
