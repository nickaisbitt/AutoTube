#!/usr/bin/env node
/**
 * Video Watcher MCP — for Cursor agents to "watch" exported MP4s.
 *
 * Tools:
 *   watch_video          — frames + technical + vision critique (numbered report)
 *   list_default_videos  — canonical artifact paths in the repo
 */
import { watchVideo, resolveVideoPath, PROJECT_ROOT, DEFAULT_CANDIDATES } from './analyze.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const mcpResponse = (id, result) => JSON.stringify({ jsonrpc: '2.0', id, result });
const mcpError = (id, code, message) =>
  JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
const toolResult = (text) => ({
  content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) }],
});

async function toolWatchVideo(args = {}) {
  const result = await watchVideo({
    video_path: args.video_path,
    interval_sec: args.interval_sec ?? 5,
    max_duration_sec: args.max_duration_sec,
    vision_frames: args.vision_frames ?? 12,
    skip_vision: args.skip_vision === true,
    script_text: args.script_text,
    api_key: args.api_key,
  });

  const intro = [
    'Video Watcher finished. Use the numbered items below when replying to the user.',
    '',
    `REPORT_FILE: ${result.reportPath}`,
    result.contactSheet ? `CONTACT_SHEET: ${result.contactSheet}` : '',
    `FRAMES_DIR: ${result.outDir}`,
    '',
    'Tip: In Cursor, @-mention the contact sheet or frame JPGs for visual inspection without vision API.',
    '',
    '---',
    '',
    result.reportText,
  ]
    .filter(Boolean)
    .join('\n');

  return toolResult(intro);
}

function toolListDefaults() {
  const rows = DEFAULT_CANDIDATES.map((rel, i) => {
    const full = join(PROJECT_ROOT, rel);
    const ok = existsSync(full);
    return `${i + 1}. ${rel} — ${ok ? 'exists' : 'missing'}`;
  });
  return toolResult(
    [
      'Default video paths (first existing is used when video_path is omitted):',
      '',
      ...rows,
      '',
      `${rows.length + 1}. Pass video_path explicitly for any other MP4.`,
    ].join('\n'),
  );
}

const TOOLS = [
  {
    name: 'watch_video',
    description:
      'Analyze an MP4 like a harsh YouTube reviewer: extract frames (incl. hook 0–3s), contact sheet, technical checks, optional OpenRouter vision. Writes WATCH_REPORT.md with NUMBERED findings. Default: latest docs/artifacts full or review export.',
    inputSchema: {
      type: 'object',
      properties: {
        video_path: {
          type: 'string',
          description: 'Absolute or repo-relative path to MP4. Omit to use latest canonical artifact.',
        },
        interval_sec: {
          type: 'number',
          description: 'Extract one frame every N seconds (default 5). Use 2–3 for stricter pacing audit.',
          default: 5,
        },
        max_duration_sec: {
          type: 'number',
          description: 'Only analyze first N seconds (e.g. 90 for hook/pacing focus).',
        },
        vision_frames: {
          type: 'number',
          description: 'Frames sent to vision model (default 12).',
          default: 12,
        },
        skip_vision: {
          type: 'boolean',
          description: 'If true, only extract frames + technical (no API). Agent can read JPGs directly.',
          default: false,
        },
        script_text: {
          type: 'string',
          description: 'Optional narration script for vision context.',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_default_videos',
    description: 'List default MP4 paths the watcher checks when no video_path is given.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const { id, method, params } = msg;

    if (method === 'initialize') {
      process.stdout.write(
        mcpResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'video-watcher', version: '1.0.0' },
        }) + '\n',
      );
      continue;
    }

    if (method === 'tools/list') {
      process.stdout.write(mcpResponse(id, { tools: TOOLS }) + '\n');
      continue;
    }

    if (method === 'tools/call') {
      const { name, arguments: args = {} } = params;
      try {
        let result;
        switch (name) {
          case 'watch_video':
            result = await toolWatchVideo(args);
            break;
          case 'list_default_videos':
            result = toolListDefaults();
            break;
          default:
            result = toolResult(`Unknown tool: ${name}`);
        }
        process.stdout.write(mcpResponse(id, result) + '\n');
      } catch (err) {
        process.stdout.write(mcpError(id, -32000, err.message) + '\n');
      }
      continue;
    }

    if (id !== undefined) {
      process.stdout.write(mcpError(id, -32601, `Method not found: ${method}`) + '\n');
    }
  }
});

process.stdin.on('end', () => process.exit(0));
