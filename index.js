#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';

const NOTES_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  'notes'
);
const ARCHIVE_DIR = path.join(NOTES_DIR, 'archive');

// ── Markdown helpers ─────────────────────────────────────────────────────────

function projectFilePath(project, archived = false) {
  const safe = project.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(archived ? ARCHIVE_DIR : NOTES_DIR, `${safe}.md`);
}

function shortDate() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function formatTimestamp() {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function parseMarkdown(content) {
  const lines = content.split('\n');
  const sections = {};
  let currentSection = null;
  let title = '';

  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
    } else if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
      sections[currentSection] = [];
    } else if (currentSection && line.startsWith('- ')) {
      sections[currentSection].push(line.slice(2).trim());
    }
  }

  return { title, sections };
}

function buildMarkdown(project, sections) {
  // Pinned always first, Done always last
  const order = Object.keys(sections);
  const sorted = [
    ...order.filter(s => s === 'Pinned'),
    ...order.filter(s => s !== 'Pinned' && s !== 'Done'),
    ...order.filter(s => s === 'Done'),
  ];

  const sectionBlocks = sorted
    .filter(heading => sections[heading] && sections[heading].length > 0)
    .map(heading => {
      const bullets = sections[heading].map(n => `- ${n}`).join('\n');
      return `## ${heading}\n${bullets}`;
    })
    .join('\n\n');

  return `# ${project}\n\n_Last updated: ${formatTimestamp()}_\n\n---\n\n${sectionBlocks}\n`;
}

async function ensureDir() {
  await fs.mkdir(NOTES_DIR, { recursive: true });
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
}

async function readProject(project) {
  const filePath = projectFilePath(project);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { exists: true, content, parsed: parseMarkdown(content) };
  } catch {
    return { exists: false, content: '', parsed: { title: project, sections: {} } };
  }
}

async function writeProject(project, sections) {
  await ensureDir();
  const content = buildMarkdown(project, sections);
  await fs.writeFile(projectFilePath(project), content, 'utf-8');
  return content;
}

async function getAllProjects() {
  await ensureDir();
  const files = await fs.readdir(NOTES_DIR);
  return files.filter(f => f.endsWith('.md'));
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'claude-notes', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'add_note',
      description: 'Add one or more notes to a section in a project file. Creates the file and section if they do not exist. Each note is automatically timestamped and deduplicated.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name, e.g. MyApp' },
          section: { type: 'string', description: 'Section heading, e.g. "Bug Fixes" or "Ideas"' },
          notes: {
            type: 'array',
            items: { type: 'string' },
            description: 'One or more note strings to add',
          },
        },
        required: ['project', 'section', 'notes'],
      },
    },
    {
      name: 'get_notes',
      description: 'Read all notes for a project, returned as raw markdown.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name' },
        },
        required: ['project'],
      },
    },
    {
      name: 'list_projects',
      description: 'List all project note files.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'search_notes',
      description: 'Search across all project notes for a keyword, phrase, or tag (case-insensitive).',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term, phrase, or tag (e.g. #bug)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'update_section',
      description: 'Replace all notes in a specific section. Use this to reorganize or clean up a section.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          section: { type: 'string' },
          notes: { type: 'array', items: { type: 'string' } },
        },
        required: ['project', 'section', 'notes'],
      },
    },
    {
      name: 'delete_note',
      description: 'Remove a specific note from a section by its exact text.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          section: { type: 'string' },
          note: { type: 'string', description: 'Exact note text to remove' },
        },
        required: ['project', 'section', 'note'],
      },
    },
    {
      name: 'delete_section',
      description: 'Remove an entire section from a project file.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          section: { type: 'string' },
        },
        required: ['project', 'section'],
      },
    },
    {
      name: 'rename_section',
      description: 'Rename a section heading within a project file.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          old_section: { type: 'string' },
          new_section: { type: 'string' },
        },
        required: ['project', 'old_section', 'new_section'],
      },
    },
    {
      name: 'archive_note',
      description: 'Move a note from its current section to the Done section, or move it to archive.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          section: { type: 'string' },
          note: { type: 'string', description: 'Exact note text to archive' },
          mode: { type: 'string', enum: ['done', 'remove'], description: 'done = move to Done section, remove = move to archive file. Defaults to done.' },
        },
        required: ['project', 'section', 'note'],
      },
    },
    {
      name: 'pin_note',
      description: 'Pin a note to a project. Pinned notes always appear at the top of the project file.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          note: { type: 'string', description: 'Note text to pin' },
        },
        required: ['project', 'note'],
      },
    },
    {
      name: 'get_pins',
      description: 'Get all pinned notes across all projects.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_recent',
      description: 'Get the most recently added notes across all projects.',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of recent notes to return (default 10)' },
        },
      },
    },
    {
      name: 'get_status',
      description: 'Get a quick snapshot of a project: note counts per section, last updated, any blockers.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
        },
        required: ['project'],
      },
    },
    {
      name: 'nuke_project',
      description: 'Delete an entire project note file. This is destructive and cannot be undone.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          confirm: { type: 'boolean', description: 'Must be true to confirm deletion' },
        },
        required: ['project', 'confirm'],
      },
    },
    {
      name: 'digest',
      description: 'Generate a summary of all notes added within a date range across all projects.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look back (default 7)' },
        },
      },
    },
    {
      name: 'export_notes',
      description: 'Export all notes (or a single project) into one combined markdown document.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Optional: single project to export. Omit for all.' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'add_note': {
        const { project, section, notes } = args;
        const { parsed } = await readProject(project);
        if (!parsed.sections[section]) parsed.sections[section] = [];

        const stamp = shortDate();
        const existing = new Set(parsed.sections[section].map(n => n.replace(/^\[.*?\]\s*/, '')));
        const added = [];
        const skipped = [];

        for (const note of notes) {
          if (existing.has(note)) {
            skipped.push(note);
          } else {
            parsed.sections[section].push(`[${stamp}] ${note}`);
            existing.add(note);
            added.push(note);
          }
        }

        await writeProject(project, parsed.sections);

        let msg = `Added ${added.length} note(s) to [${project}] › ${section}`;
        if (skipped.length > 0) {
          msg += `\nSkipped ${skipped.length} duplicate(s): ${skipped.join('; ')}`;
        }
        return { content: [{ type: 'text', text: msg }] };
      }

      case 'get_notes': {
        const { project } = args;
        const { exists, content } = await readProject(project);
        if (!exists) {
          return { content: [{ type: 'text', text: `No notes found for project: ${project}` }] };
        }
        return { content: [{ type: 'text', text: content }] };
      }

      case 'list_projects': {
        const mdFiles = await getAllProjects();
        if (mdFiles.length === 0) {
          return { content: [{ type: 'text', text: 'No project note files found.' }] };
        }
        const list = mdFiles.map(f => `- ${f.replace('.md', '')}`).join('\n');
        return { content: [{ type: 'text', text: `Projects:\n${list}` }] };
      }

      case 'search_notes': {
        const { query } = args;
        const mdFiles = await getAllProjects();
        const results = [];
        const lowerQuery = query.toLowerCase();

        for (const file of mdFiles) {
          const content = await fs.readFile(path.join(NOTES_DIR, file), 'utf-8');
          const lines = content.split('\n');
          const matches = lines.filter(l => l.toLowerCase().includes(lowerQuery));
          if (matches.length > 0) {
            const project = file.replace('.md', '');
            results.push(`**${project}** (${matches.length} match${matches.length > 1 ? 'es' : ''}):\n${matches.map(m => `  ${m}`).join('\n')}`);
          }
        }

        if (results.length === 0) {
          return { content: [{ type: 'text', text: `No results for "${query}"` }] };
        }
        return { content: [{ type: 'text', text: results.join('\n\n') }] };
      }

      case 'update_section': {
        const { project, section, notes } = args;
        const { parsed } = await readProject(project);
        parsed.sections[section] = notes;
        await writeProject(project, parsed.sections);
        return {
          content: [{
            type: 'text',
            text: `Updated section [${section}] in ${project} with ${notes.length} note(s)`,
          }],
        };
      }

      case 'delete_note': {
        const { project, section, note } = args;
        const { parsed } = await readProject(project);
        if (!parsed.sections[section]) {
          return { content: [{ type: 'text', text: `Section "${section}" not found in ${project}` }] };
        }
        const before = parsed.sections[section].length;
        parsed.sections[section] = parsed.sections[section].filter(n => {
          const bare = n.replace(/^\[.*?\]\s*/, '');
          return bare !== note && n !== note;
        });
        const removed = before - parsed.sections[section].length;
        if (parsed.sections[section].length === 0) delete parsed.sections[section];
        await writeProject(project, parsed.sections);
        return {
          content: [{
            type: 'text',
            text: removed > 0 ? `Removed note from [${project}] › ${section}` : `Note not found in ${section}`,
          }],
        };
      }

      case 'delete_section': {
        const { project, section } = args;
        const { parsed } = await readProject(project);
        if (!parsed.sections[section]) {
          return { content: [{ type: 'text', text: `Section "${section}" not found in ${project}` }] };
        }
        delete parsed.sections[section];
        await writeProject(project, parsed.sections);
        return { content: [{ type: 'text', text: `Deleted section [${section}] from ${project}` }] };
      }

      case 'rename_section': {
        const { project, old_section, new_section } = args;
        const { parsed } = await readProject(project);
        if (!parsed.sections[old_section]) {
          return { content: [{ type: 'text', text: `Section "${old_section}" not found in ${project}` }] };
        }
        const notes = parsed.sections[old_section];
        delete parsed.sections[old_section];
        parsed.sections[new_section] = notes;
        await writeProject(project, parsed.sections);
        return {
          content: [{
            type: 'text',
            text: `Renamed section "${old_section}" → "${new_section}" in ${project}`,
          }],
        };
      }

      case 'archive_note': {
        const { project, section, note, mode = 'done' } = args;
        const { parsed } = await readProject(project);
        if (!parsed.sections[section]) {
          return { content: [{ type: 'text', text: `Section "${section}" not found in ${project}` }] };
        }

        let foundNote = null;
        parsed.sections[section] = parsed.sections[section].filter(n => {
          const bare = n.replace(/^\[.*?\]\s*/, '');
          if (bare === note || n === note) {
            foundNote = n;
            return false;
          }
          return true;
        });

        if (!foundNote) {
          return { content: [{ type: 'text', text: `Note not found in ${section}` }] };
        }

        if (parsed.sections[section].length === 0) delete parsed.sections[section];

        if (mode === 'done') {
          if (!parsed.sections['Done']) parsed.sections['Done'] = [];
          parsed.sections['Done'].push(`[${shortDate()}] ~~${foundNote.replace(/^\[.*?\]\s*/, '')}~~`);
          await writeProject(project, parsed.sections);
          return { content: [{ type: 'text', text: `Moved note to Done in ${project}` }] };
        } else {
          await writeProject(project, parsed.sections);
          const archivePath = projectFilePath(project, true);
          let archiveContent = '';
          try { archiveContent = await fs.readFile(archivePath, 'utf-8'); } catch {}
          archiveContent += `- [${shortDate()}] ${foundNote.replace(/^\[.*?\]\s*/, '')}\n`;
          await fs.writeFile(archivePath, archiveContent, 'utf-8');
          return { content: [{ type: 'text', text: `Archived note from [${project}] › ${section}` }] };
        }
      }

      case 'pin_note': {
        const { project, note } = args;
        const { parsed } = await readProject(project);
        if (!parsed.sections['Pinned']) parsed.sections['Pinned'] = [];

        const existing = new Set(parsed.sections['Pinned'].map(n => n.replace(/^\[.*?\]\s*/, '')));
        if (existing.has(note)) {
          return { content: [{ type: 'text', text: `Already pinned in ${project}` }] };
        }

        parsed.sections['Pinned'].push(`[${shortDate()}] ${note}`);
        await writeProject(project, parsed.sections);
        return { content: [{ type: 'text', text: `Pinned to ${project}: ${note}` }] };
      }

      case 'get_pins': {
        const mdFiles = await getAllProjects();
        const results = [];

        for (const file of mdFiles) {
          const content = await fs.readFile(path.join(NOTES_DIR, file), 'utf-8');
          const parsed = parseMarkdown(content);
          if (parsed.sections['Pinned'] && parsed.sections['Pinned'].length > 0) {
            const project = file.replace('.md', '');
            const bullets = parsed.sections['Pinned'].map(n => `  - ${n}`).join('\n');
            results.push(`**${project}**:\n${bullets}`);
          }
        }

        if (results.length === 0) {
          return { content: [{ type: 'text', text: 'No pinned notes.' }] };
        }
        return { content: [{ type: 'text', text: `# Pinned Notes\n\n${results.join('\n\n')}` }] };
      }

      case 'get_recent': {
        const count = args?.count ?? 10;
        const mdFiles = await getAllProjects();
        const allNotes = [];

        for (const file of mdFiles) {
          const content = await fs.readFile(path.join(NOTES_DIR, file), 'utf-8');
          const parsed = parseMarkdown(content);
          const project = file.replace('.md', '');

          for (const [section, notes] of Object.entries(parsed.sections)) {
            if (section === 'Done') continue;
            for (const note of notes) {
              const match = note.match(/^\[(.*?)\]\s*(.*)/);
              if (match) {
                const dateStr = match[1];
                const noteDate = new Date(dateStr + ', ' + new Date().getFullYear());
                allNotes.push({ project, section, note: match[2], date: noteDate, dateStr });
              }
            }
          }
        }

        allNotes.sort((a, b) => b.date - a.date);
        const recent = allNotes.slice(0, count);

        if (recent.length === 0) {
          return { content: [{ type: 'text', text: 'No notes found.' }] };
        }

        const lines = recent.map(n => `- [${n.dateStr}] **${n.project}** › ${n.section}: ${n.note}`);
        return { content: [{ type: 'text', text: `# Recent Notes\n\n${lines.join('\n')}` }] };
      }

      case 'get_status': {
        const { project } = args;
        const { exists, parsed } = await readProject(project);
        if (!exists) {
          return { content: [{ type: 'text', text: `No notes found for project: ${project}` }] };
        }

        const filePath = projectFilePath(project);
        const stat = await fs.stat(filePath);
        const lastMod = stat.mtime.toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });

        const lines = [`# ${project}`, `_Last modified: ${lastMod}_`, ''];
        let totalNotes = 0;
        const blockers = [];

        for (const [section, notes] of Object.entries(parsed.sections)) {
          totalNotes += notes.length;
          lines.push(`- **${section}**: ${notes.length} note${notes.length !== 1 ? 's' : ''}`);
          for (const note of notes) {
            if (note.toLowerCase().includes('#blocker')) {
              blockers.push(note.replace(/^\[.*?\]\s*/, ''));
            }
          }
        }

        lines.unshift('');
        lines.push('', `**Total: ${totalNotes} notes across ${Object.keys(parsed.sections).length} sections**`);

        if (blockers.length > 0) {
          lines.push('', `**Blockers (${blockers.length}):**`);
          for (const b of blockers) lines.push(`  - ${b}`);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      case 'nuke_project': {
        const { project, confirm } = args;
        if (!confirm) {
          return { content: [{ type: 'text', text: `Nuke aborted — confirm must be true to delete ${project}` }] };
        }
        const filePath = projectFilePath(project);
        try {
          await fs.unlink(filePath);
          return { content: [{ type: 'text', text: `Deleted project: ${project}` }] };
        } catch {
          return { content: [{ type: 'text', text: `Project not found: ${project}` }] };
        }
      }

      case 'digest': {
        const days = args?.days ?? 7;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const mdFiles = await getAllProjects();
        const digest = [];

        for (const file of mdFiles) {
          const content = await fs.readFile(path.join(NOTES_DIR, file), 'utf-8');
          const parsed = parseMarkdown(content);
          const project = file.replace('.md', '');
          const projectNotes = [];

          for (const [section, notes] of Object.entries(parsed.sections)) {
            for (const note of notes) {
              const match = note.match(/^\[(.*?)\]\s*/);
              if (match) {
                const noteDate = new Date(match[1] + ', ' + new Date().getFullYear());
                if (noteDate >= cutoff) {
                  projectNotes.push(`  - **${section}**: ${note}`);
                }
              }
            }
          }

          if (projectNotes.length > 0) {
            digest.push(`### ${project}\n${projectNotes.join('\n')}`);
          }
        }

        if (digest.length === 0) {
          return { content: [{ type: 'text', text: `No notes found in the last ${days} day(s).` }] };
        }
        return { content: [{ type: 'text', text: `# Digest — last ${days} day(s)\n\n${digest.join('\n\n')}` }] };
      }

      case 'export_notes': {
        const targetProject = args?.project;
        const mdFiles = await getAllProjects();
        const parts = [];

        for (const file of mdFiles) {
          const project = file.replace('.md', '');
          if (targetProject && project.toLowerCase() !== targetProject.toLowerCase()) continue;
          const content = await fs.readFile(path.join(NOTES_DIR, file), 'utf-8');
          parts.push(content);
        }

        if (parts.length === 0) {
          return { content: [{ type: 'text', text: targetProject ? `No notes for ${targetProject}` : 'No notes found.' }] };
        }

        const exported = parts.join('\n---\n\n');
        return { content: [{ type: 'text', text: exported }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
