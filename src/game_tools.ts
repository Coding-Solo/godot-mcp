/**
 * Tools that talk to a running Godot project through the in-game debug bridge:
 * framebuffer screenshots, remote input and a structured game-state dump.
 */

import { readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

import { BridgeError, DebugBridge } from './debug_bridge.js';

const INPUT_EVENTS = ['press', 'release', 'tap', 'release_all', 'click'] as const;
type InputEvent = (typeof INPUT_EVENTS)[number];

interface ToolResult {
  content: Array<Record<string, unknown>>;
  isError?: boolean;
}

/**
 * Capture the game's framebuffer.
 *
 * The capture happens inside Godot rather than through an OS window grab, so
 * it also works while the game window is occluded or in the background, and it
 * sidesteps DPI scaling and the black-frame problem that affects PrintWindow on
 * GPU-composited (D3D12/Vulkan) windows.
 */
export async function captureScreenshot(bridge: DebugBridge, args: any): Promise<ToolResult> {
  const maxWidth = clampInt(args?.maxWidth, 1280, 0, 7680);
  const outputPath: string =
    typeof args?.outputPath === 'string' && args.outputPath.trim()
      ? args.outputPath.trim()
      : join(tmpdir(), 'godot-mcp-screenshots', `godot-${Date.now()}.png`);

  // 'user://...' and 'res://...' are Godot paths, not filesystem paths: the
  // game resolves them itself, and mkdirSync would only fail on 'user:'.
  if (!outputPath.includes('://')) {
    mkdirSync(dirname(outputPath), { recursive: true });
  }

  const reply = await bridge.command({
    cmd: 'screenshot',
    path: outputPath.replace(/\\/g, '/'),
    max_width: maxWidth,
  });

  const savedPath = String(reply.path ?? outputPath);
  let data: string;
  try {
    data = readFileSync(savedPath).toString('base64');
  } catch (error) {
    throw new BridgeError(
      `The game reported saving the screenshot to ${savedPath}, but it could not be read back: ${
        error instanceof Error ? error.message : String(error)
      }`,
      ['Pick an outputPath the Godot process is allowed to write to']
    );
  }

  return {
    content: [
      {
        type: 'text',
        text: `Screenshot saved to ${savedPath} (${reply.width}x${reply.height}, captured at ${reply.source_width}x${reply.source_height}).`,
      },
      { type: 'image', data, mimeType: 'image/png' },
    ],
  };
}

/**
 * Drive the game's input remotely.
 *
 * 'tap' is usually what you want: a bare 'press' stays held until an explicit
 * 'release', which is easy to forget between tool calls.
 */
export async function sendInput(bridge: DebugBridge, args: any): Promise<ToolResult> {
  const event = String(args?.event ?? 'tap') as InputEvent;
  if (!INPUT_EVENTS.includes(event)) {
    throw new BridgeError(`Unknown event '${event}'`, [`Use one of: ${INPUT_EVENTS.join(', ')}`]);
  }

  const action = typeof args?.action === 'string' ? args.action.trim() : '';
  if (event !== 'release_all' && event !== 'click' && !action) {
    throw new BridgeError(`'${event}' requires an action name`, [
      'Use get_game_state to see which actions the project defines',
    ]);
  }

  const payload: Record<string, unknown> = { cmd: event };
  switch (event) {
    case 'press':
      payload.action = action;
      payload.strength = clampFloat(args?.strength, 1.0, 0, 1);
      break;
    case 'release':
      payload.action = action;
      break;
    case 'tap':
      payload.action = action;
      payload.strength = clampFloat(args?.strength, 1.0, 0, 1);
      payload.duration_ms = clampInt(args?.durationMs, 120, 0, 10000);
      break;
    case 'click':
      if (typeof args?.path === 'string' && args.path.trim()) {
        payload.path = args.path.trim();
      } else if (typeof args?.text === 'string' && args.text.trim()) {
        payload.text = args.text.trim();
      } else {
        throw new BridgeError("'click' requires either a button 'path' or its visible 'text'", [
          'Use get_game_state to list the buttons currently on screen',
        ]);
      }
      break;
  }

  // A tap has to outlive its own hold time before the reply arrives.
  const timeoutMs = event === 'tap' ? Number(payload.duration_ms) + 15000 : undefined;
  const reply = await bridge.command(payload, timeoutMs);

  return {
    content: [{ type: 'text', text: describeInputReply(event, reply) }],
  };
}

/** Read the structured game state: cheaper and more precise than a screenshot. */
export async function getGameState(bridge: DebugBridge): Promise<ToolResult> {
  const reply = await bridge.command({ cmd: 'state' });
  const { ok, id, ...state } = reply;
  return {
    content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
  };
}

function describeInputReply(event: InputEvent, reply: Record<string, unknown>): string {
  switch (event) {
    case 'press':
      return `Holding '${reply.action}' at strength ${reply.strength}. Remember to release it.`;
    case 'release':
      return `Released '${reply.action}'.`;
    case 'tap':
      return `Held '${reply.action}' for ${reply.duration_ms}ms, then released it.`;
    case 'release_all': {
      const released = Array.isArray(reply.released) ? reply.released : [];
      return released.length ? `Released: ${released.join(', ')}.` : 'No actions were being held.';
    }
    case 'click':
      return `Pressed the button '${reply.text}' at ${reply.clicked}.`;
  }
}

/**
 * Deliberately not Number(): Number(null), Number(true), Number([]) and
 * Number('') are all finite, so an explicit null would become a 0ms tap, a
 * strength of 0, or a full-resolution screenshot instead of falling back to
 * the documented default.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = toNumber(value);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampFloat(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = toNumber(value);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
