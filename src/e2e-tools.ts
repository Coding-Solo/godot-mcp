/**
 * E2E Testing Tools — MCP tool schemas, handlers, and dispatch for the E2E TestBridge.
 *
 * Exports getE2EToolSchemas(), handleE2ETool(), and getE2EParameterMappings()
 * which are wired into GodotServer via index.ts.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { BridgeClient, BridgeCapabilities } from './bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Context passed from GodotServer for tools that need server-level access.
 */
export interface ServerContext {
  bridge: BridgeClient;
  createErrorResponse: (message: string, possibleSolutions?: string[]) => any;
  normalizeParameters: (params: Record<string, any>) => Record<string, any>;
  godotPath: string | null;
  setActiveProcess: (proc: any) => void;
  getActiveProcess: () => any;
}

// ─── Path Validation ────────────────────────────────────────────────────────

function validatePath(p: string): string | null {
  if (p.includes('..')) return 'Path contains ".." traversal sequence';
  return null;
}

// ─── Tool Schema Definitions ────────────────────────────────────────────────

export function getE2EToolSchemas(): Array<{ name: string; description: string; inputSchema: any }> {
  return [
    // --- Connection Management ---
    {
      name: 'connect_to_game',
      description: 'Connect to a running Godot instance\'s TestBridge WebSocket server.',
      inputSchema: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'Host address (default: localhost)', default: 'localhost' },
          port: { type: 'number', description: 'WebSocket port (default: 9505)', default: 9505 },
        },
      },
    },
    {
      name: 'disconnect_from_game',
      description: 'Close the WebSocket connection to the running Godot instance gracefully.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_connection_status',
      description: 'Check connection status and get game info (project name, capabilities, godot version).',
      inputSchema: { type: 'object', properties: {} },
    },

    // --- Input Simulation ---
    {
      name: 'send_key',
      description: 'Send a keyboard event to the running game. Supports modifier combos like "Ctrl+S". For games using Input Map actions, prefer send_input_action which triggers actions directly regardless of key bindings.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key name (e.g., "E", "Space", "Ctrl+Shift+S", "F1")' },
          action: { type: 'string', enum: ['press', 'release', 'tap'], default: 'tap', description: 'Key action (default: tap = press + release)' },
          hold_ms: { type: 'number', description: 'Hold duration in ms for tap action (default: 100)', default: 100 },
        },
        required: ['key'],
      },
    },
    {
      name: 'send_mouse_click',
      description: 'Send a mouse click at screen coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate' },
          y: { type: 'number', description: 'Y coordinate' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left', description: 'Mouse button (default: left)' },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'send_mouse_move',
      description: 'Move the mouse cursor to screen coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Target X coordinate' },
          y: { type: 'number', description: 'Target Y coordinate' },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'send_mouse_drag',
      description: 'Perform a mouse drag from one position to another over a duration.',
      inputSchema: {
        type: 'object',
        properties: {
          from_x: { type: 'number', description: 'Start X' },
          from_y: { type: 'number', description: 'Start Y' },
          to_x: { type: 'number', description: 'End X' },
          to_y: { type: 'number', description: 'End Y' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left' },
          duration_ms: { type: 'number', description: 'Drag duration in ms (default: 500)', default: 500 },
        },
        required: ['from_x', 'from_y', 'to_x', 'to_y'],
      },
    },
    {
      name: 'send_input_action',
      description: 'Trigger a named Godot Input Map action (e.g., "ui_accept", "move_left"). Preferred method for games using Godot Input Map. Directly triggers named actions so Input.is_action_pressed() returns true. Use this instead of send_key when the game uses Input Map actions.',
      inputSchema: {
        type: 'object',
        properties: {
          action_name: { type: 'string', description: 'Godot Input Map action name' },
          action: { type: 'string', enum: ['press', 'release', 'tap'], default: 'tap', description: 'Action type (default: tap = press + delayed release)' },
          hold_ms: { type: 'number', description: 'Hold duration for tap (default: 100)', default: 100 },
        },
        required: ['action_name'],
      },
    },

    // --- Scene Tree Inspection ---
    {
      name: 'get_scene_tree',
      description: 'Get the scene tree structure as JSON. Returns node names, types, paths, visibility, and children.',
      inputSchema: {
        type: 'object',
        properties: {
          root_path: { type: 'string', description: 'Root node path (default: /root)', default: '/root' },
          max_depth: { type: 'number', description: 'Maximum traversal depth (default: 4)', default: 4 },
        },
      },
    },
    {
      name: 'get_node_properties',
      description: 'Get property values from a specific node. Pass "*" for properties to get all properties.',
      inputSchema: {
        type: 'object',
        properties: {
          node_path: { type: 'string', description: 'Path to the node (e.g., "/root/Main/Player")' },
          properties: {
            description: 'Array of property names to read, or "*" for all properties',
            oneOf: [
              { type: 'array', items: { type: 'string' } },
              { type: 'string', enum: ['*'] },
            ],
          },
        },
        required: ['node_path', 'properties'],
      },
    },
    {
      name: 'find_nodes',
      description: 'Search for nodes by type, name pattern, or group membership.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Class name filter (e.g., "Label", "CharacterBody2D")' },
          name_pattern: { type: 'string', description: 'Glob pattern for node name (e.g., "Enemy*")' },
          group: { type: 'string', description: 'Group name filter' },
          root_path: { type: 'string', description: 'Root search path (default: /root)', default: '/root' },
        },
      },
    },
    {
      name: 'get_viewport_info',
      description: 'Get viewport info: size, mouse position, active camera details.',
      inputSchema: { type: 'object', properties: {} },
    },

    // --- Game State Queries ---
    {
      name: 'call_method',
      description: 'Call a method on a node and return the result. Works with GDScript and exported C# methods.',
      inputSchema: {
        type: 'object',
        properties: {
          node_path: { type: 'string', description: 'Path to target node' },
          method_name: { type: 'string', description: 'Method to call' },
          args: { type: 'array', description: 'Method arguments (default: [])', default: [] },
        },
        required: ['node_path', 'method_name'],
      },
    },
    {
      name: 'get_singleton',
      description: 'Read properties from an autoload singleton (e.g., GameManager, AudioManager).',
      inputSchema: {
        type: 'object',
        properties: {
          singleton_name: { type: 'string', description: 'Autoload name (as registered in project.godot)' },
          properties: { type: 'array', items: { type: 'string' }, description: 'Property names to read' },
        },
        required: ['singleton_name', 'properties'],
      },
    },
    {
      name: 'evaluate_expression',
      description: 'Evaluate a GDScript expression at runtime. Requires TestBridge to be started with --unsafe flag. Powerful but dangerous — use only for testing.',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'GDScript expression to evaluate (e.g., "2 + 2", "get_node(\\"/root/Main\\").position")' },
          base_node_path: { type: 'string', description: 'Base node for expression context (default: /root)', default: '/root' },
        },
        required: ['expression'],
      },
    },

    // --- Wait / Polling ---
    {
      name: 'wait_for_condition',
      description: 'Poll a GDScript expression until it becomes truthy or times out. Returns whether the condition was satisfied and how long it took.',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'GDScript expression that should eventually return truthy' },
          timeout_ms: { type: 'number', description: 'Max wait time in ms (default: 5000)', default: 5000 },
          poll_interval_ms: { type: 'number', description: 'Polling interval in ms (default: 100, min: 16)', default: 100 },
          base_node_path: { type: 'string', description: 'Base node for expression context', default: '/root' },
        },
        required: ['expression'],
      },
    },
    {
      name: 'wait_frames',
      description: 'Wait for a specific number of game frames to pass.',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of frames to wait' },
        },
        required: ['count'],
      },
    },
    {
      name: 'wait_for_signal',
      description: 'Wait for a signal to be emitted from a node, with timeout.',
      inputSchema: {
        type: 'object',
        properties: {
          node_path: { type: 'string', description: 'Path to the node that emits the signal' },
          signal_name: { type: 'string', description: 'Signal name to wait for' },
          timeout_ms: { type: 'number', description: 'Max wait time in ms (default: 5000)', default: 5000 },
        },
        required: ['node_path', 'signal_name'],
      },
    },

    // --- Visual Verification ---
    {
      name: 'take_screenshot',
      description: 'Capture a screenshot of the game viewport as base64 PNG. Response may be large. Requires a visible display (not headless).',
      inputSchema: {
        type: 'object',
        properties: {
          region: {
            type: 'object',
            description: 'Optional region to crop (x, y, width, height)',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
        },
      },
    },
    {
      name: 'get_pixel_color',
      description: 'Get the RGBA color of a pixel at specific coordinates. Values are 0.0-1.0. Requires a visible display.',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate' },
          y: { type: 'number', description: 'Y coordinate' },
        },
        required: ['x', 'y'],
      },
    },

    // --- Test Orchestration ---
    {
      name: 'run_project_with_bridge',
      description: 'Launch a Godot project with TestBridge enabled and automatically connect. Combines run_project + connect_to_game in one step.',
      inputSchema: {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Path to Godot project directory' },
          scene: { type: 'string', description: 'Optional scene to run (e.g., "res://main.tscn")' },
          port: { type: 'number', description: 'TestBridge port (default: 9505)', default: 9505 },
          timeout_ms: { type: 'number', description: 'Max time to wait for connection in ms (default: 10000)', default: 10000 },
        },
        required: ['project_path'],
      },
    },
    {
      name: 'reset_scene',
      description: 'Reload the current scene to a clean state. Warning: any pending wait_for_condition or wait_for_signal calls will fail as their target nodes are destroyed during reload.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'load_scene',
      description: 'Switch to a different scene. Warning: any pending wait_for_condition or wait_for_signal calls will fail as their target nodes are destroyed during scene change.',
      inputSchema: {
        type: 'object',
        properties: {
          scene_path: { type: 'string', description: 'Scene resource path (e.g., "res://levels/level2.tscn")' },
        },
        required: ['scene_path'],
      },
    },
    {
      name: 'install_test_bridge',
      description: 'Install TestBridge.gd into a Godot project and register it as an autoload. Copies the file to addons/test_bridge/ and updates project.godot.',
      inputSchema: {
        type: 'object',
        properties: {
          project_path: { type: 'string', description: 'Path to the Godot project directory' },
        },
        required: ['project_path'],
      },
    },
  ];
}

// ─── Parameter Mappings ─────────────────────────────────────────────────────

export function getE2EParameterMappings(): Record<string, string> {
  return {
    'action_name': 'actionName',
    'hold_ms': 'holdMs',
    'from_x': 'fromX',
    'from_y': 'fromY',
    'to_x': 'toX',
    'to_y': 'toY',
    'duration_ms': 'durationMs',
    'root_path': 'rootPath',
    'max_depth': 'maxDepth',
    'node_path': 'nodePath',
    'name_pattern': 'namePattern',
    'method_name': 'methodName',
    'singleton_name': 'singletonName',
    'base_node_path': 'baseNodePath',
    'timeout_ms': 'timeoutMs',
    'poll_interval_ms': 'pollIntervalMs',
    'signal_name': 'signalName',
    'project_path': 'projectPath',
    'scene_path': 'scenePath',
  };
}

// ─── Tool Dispatch ──────────────────────────────────────────────────────────

export async function handleE2ETool(
  name: string,
  args: Record<string, any> | undefined,
  context: ServerContext,
): Promise<any> {
  const params = context.normalizeParameters(args ?? {});
  const { bridge, createErrorResponse } = context;

  switch (name) {
    // Connection Management
    case 'connect_to_game':
      return handleConnectToGame(params, bridge, createErrorResponse);
    case 'disconnect_from_game':
      return handleDisconnectFromGame(bridge);
    case 'get_connection_status':
      return handleGetConnectionStatus(bridge);

    // Input Simulation
    case 'send_key':
    case 'send_mouse_click':
    case 'send_mouse_move':
    case 'send_mouse_drag':
    case 'send_input_action':
      return handleBridgePassthrough(name, params, bridge, createErrorResponse, 'input');

    // Scene Tree Inspection
    case 'get_scene_tree':
    case 'get_node_properties':
    case 'find_nodes':
    case 'get_viewport_info':
      return handleBridgePassthrough(name, params, bridge, createErrorResponse, 'scene_tree');

    // Game State
    case 'call_method':
    case 'get_singleton':
      return handleBridgePassthrough(name, params, bridge, createErrorResponse, 'state');
    case 'evaluate_expression':
      return handleEvaluateExpression(params, bridge, createErrorResponse);

    // Wait / Polling
    case 'wait_for_condition':
    case 'wait_for_signal':
      return handleWaitTool(name, params, bridge, createErrorResponse);
    case 'wait_frames':
      return handleBridgePassthrough(name, params, bridge, createErrorResponse, 'wait');

    // Visual Verification
    case 'take_screenshot':
    case 'get_pixel_color':
      return handleBridgePassthrough(name, params, bridge, createErrorResponse, 'screenshot');

    // Test Orchestration
    case 'run_project_with_bridge':
      return handleRunProjectWithBridge(params, context);
    case 'reset_scene':
    case 'load_scene':
      return handleBridgePassthrough(name, params, bridge, createErrorResponse);
    case 'install_test_bridge':
      return handleInstallTestBridge(params, createErrorResponse);

    default:
      return null; // Not an E2E tool — let caller handle
  }
}

// ─── Helper: Success Response ───────────────────────────────────────────────

function successResponse(data: any): any {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

// ─── Helper: Convert camelCase params back to snake_case for TestBridge ─────

let _cachedReverseMap: Record<string, string> | null = null;

function getReverseParamMap(): Record<string, string> {
  if (!_cachedReverseMap) {
    _cachedReverseMap = {};
    const mappings = getE2EParameterMappings();
    for (const [snake, camel] of Object.entries(mappings)) {
      _cachedReverseMap[camel] = snake;
    }
  }
  return _cachedReverseMap;
}

function toSnakeCaseParams(params: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  const reverseMap = getReverseParamMap();
  for (const [key, val] of Object.entries(params)) {
    const snakeKey = reverseMap[key] ?? key;
    result[snakeKey] = val;
  }
  return result;
}

// ─── Connection Handlers ────────────────────────────────────────────────────

async function handleConnectToGame(
  params: Record<string, any>,
  bridge: BridgeClient,
  createErrorResponse: (msg: string, solutions?: string[]) => any,
): Promise<any> {
  const host = params.host ?? 'localhost';
  const port = params.port ?? 9505;

  try {
    const caps = await bridge.connect(host, port);
    return successResponse({ connected: true, ...caps });
  } catch (err: any) {
    return createErrorResponse(
      `Failed to connect to TestBridge at ${host}:${port}: ${err.message}`,
      [
        'Ensure Godot is running with --test-bridge flag',
        'Check that TestBridge is installed (use install_test_bridge)',
        'Verify the port is correct (default: 9505)',
      ],
    );
  }
}

async function handleDisconnectFromGame(bridge: BridgeClient): Promise<any> {
  bridge.disconnect();
  return successResponse({ disconnected: true });
}

async function handleGetConnectionStatus(bridge: BridgeClient): Promise<any> {
  if (bridge.isConnected()) {
    const caps = bridge.getCapabilities();
    return successResponse({ connected: true, ...caps });
  }
  return successResponse({ connected: false });
}

// ─── Generic Bridge Passthrough ─────────────────────────────────────────────

async function handleBridgePassthrough(
  method: string,
  params: Record<string, any>,
  bridge: BridgeClient,
  createErrorResponse: (msg: string, solutions?: string[]) => any,
  requiredCapability?: string,
): Promise<any> {
  if (!bridge.isConnected()) {
    return createErrorResponse(
      'Not connected to game',
      ['Call connect_to_game or run_project_with_bridge first'],
    );
  }

  if (requiredCapability) {
    const caps = bridge.getCapabilities();
    if (caps && !caps.capabilities.includes(requiredCapability)) {
      return createErrorResponse(
        `Game does not support '${requiredCapability}' capability`,
        ['Check get_connection_status for available capabilities'],
      );
    }
  }

  try {
    const snakeParams = toSnakeCaseParams(params);
    const result = await bridge.send(method, snakeParams);
    return successResponse(result);
  } catch (err: any) {
    return createErrorResponse(err.message);
  }
}

// ─── Evaluate Expression ────────────────────────────────────────────────────

async function handleEvaluateExpression(
  params: Record<string, any>,
  bridge: BridgeClient,
  createErrorResponse: (msg: string, solutions?: string[]) => any,
): Promise<any> {
  if (!bridge.isConnected()) {
    return createErrorResponse('Not connected to game', ['Call connect_to_game first']);
  }

  const caps = bridge.getCapabilities();
  if (caps && !caps.capabilities.includes('evaluate')) {
    return createErrorResponse(
      'evaluate_expression requires the --unsafe flag on TestBridge',
      ['Start the game with: --test-bridge --unsafe'],
    );
  }

  try {
    const snakeParams = toSnakeCaseParams(params);
    const result = await bridge.send('evaluate_expression', snakeParams);
    return successResponse(result);
  } catch (err: any) {
    return createErrorResponse(err.message);
  }
}

// ─── Wait Tools (extended timeout) ──────────────────────────────────────────

async function handleWaitTool(
  method: string,
  params: Record<string, any>,
  bridge: BridgeClient,
  createErrorResponse: (msg: string, solutions?: string[]) => any,
): Promise<any> {
  if (!bridge.isConnected()) {
    return createErrorResponse('Not connected to game', ['Call connect_to_game first']);
  }

  const caps = bridge.getCapabilities();
  if (caps && !caps.capabilities.includes('wait')) {
    return createErrorResponse('Game does not support wait capability');
  }

  // wait_for_condition uses Expression evaluation — requires --unsafe
  if (method === 'wait_for_condition' && caps && !caps.capabilities.includes('evaluate')) {
    return createErrorResponse(
      'wait_for_condition uses expression evaluation and requires --unsafe flag on TestBridge',
      ['Start the game with: --test-bridge --unsafe'],
    );
  }

  // Extended timeout: Godot-side timeout + 2s buffer for network/processing
  const godotTimeout = params.timeoutMs ?? 5000;
  const bridgeTimeout = godotTimeout + 2000;

  try {
    const snakeParams = toSnakeCaseParams(params);
    const result = await bridge.send(method, snakeParams, bridgeTimeout);
    return successResponse(result);
  } catch (err: any) {
    return createErrorResponse(err.message);
  }
}

// ─── Run Project With Bridge ────────────────────────────────────────────────

async function handleRunProjectWithBridge(
  params: Record<string, any>,
  context: ServerContext,
): Promise<any> {
  const { bridge, createErrorResponse, godotPath, setActiveProcess } = context;

  if (!godotPath) {
    return createErrorResponse('Godot path not configured', ['Set GODOT_PATH or let the server auto-detect']);
  }

  const projectPath = params.projectPath;
  if (!projectPath) {
    return createErrorResponse('Missing required parameter: project_path');
  }
  const pathErr = validatePath(projectPath);
  if (pathErr) {
    return createErrorResponse(`Invalid project_path: ${pathErr}`);
  }

  const port = params.port ?? 9505;
  const timeoutMs = params.timeoutMs ?? 10000;
  const scene = params.scene;

  // Build Godot CLI args
  const godotArgs = ['-d', '--path', projectPath];
  if (scene) {
    godotArgs.push('--scene', scene);
  }
  // Args after -- go to the game
  godotArgs.push('--', '--test-bridge', `--test-bridge-port=${port}`);

  return new Promise((resolve) => {
    const output: string[] = [];
    const errors: string[] = [];
    let settled = false; // Unified guard: resolve() only once
    let connecting = false; // Reentrancy guard for stdout handler

    const settle = (result: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      resolve(result);
    };

    const proc = spawn(godotPath, godotArgs);

    // Register as active process so stop_project can kill it
    const activeProc = { process: proc, output, errors };
    setActiveProcess(activeProc);

    // Overall timeout
    const timeoutTimer = setTimeout(() => {
      if (!settled) {
        proc.kill();
        settle(createErrorResponse(
          `Timed out waiting for TestBridge after ${timeoutMs}ms`,
          [
            'Ensure TestBridge is installed in the project',
            'Check stderr output: ' + errors.join('\n').slice(0, 500),
          ],
        ));
      }
    }, timeoutMs);

    proc.stdout.on('data', async (data: Buffer) => {
      const text = data.toString();
      output.push(text);

      // Check for error signal
      const errorMatch = text.match(/TESTBRIDGE_ERROR:(\w+):(\d+)/);
      if (errorMatch) {
        settle(createErrorResponse(
          `TestBridge failed to start: ${errorMatch[1]} on port ${errorMatch[2]}`,
          ['Try a different port', 'Check if another instance is using the port'],
        ));
        return;
      }

      // Check for ready signal — reentrancy guard prevents parallel backoff loops
      const readyMatch = text.match(/TESTBRIDGE_READY:(\d+)/);
      if (readyMatch && !settled && !connecting) {
        connecting = true;
        const readyPort = parseInt(readyMatch[1], 10);
        console.error(`[E2E] TestBridge ready on port ${readyPort}`);

        // Wait briefly for TCP server to stabilize, then connect with backoff
        await new Promise(r => setTimeout(r, 500));

        const backoffDelays = [200, 400, 800, 1600, 3200];
        for (const delay of backoffDelays) {
          if (settled) break;
          try {
            const caps = await bridge.connect('localhost', readyPort);
            settle(successResponse({
              connected: true,
              port: readyPort,
              project: caps.project_name,
              ...caps,
            }));
            return;
          } catch {
            console.error(`[E2E] Connection attempt failed, retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }

        if (!settled) {
          settle(createErrorResponse(
            'TestBridge ready but could not establish WebSocket connection',
            ['Port may be blocked', 'TestBridge may have crashed after startup'],
          ));
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      errors.push(data.toString());
    });

    proc.on('exit', (code) => {
      if (!settled) {
        settle(createErrorResponse(
          `Godot process exited with code ${code} before TestBridge was ready`,
          [
            'Check project path and scene',
            'Stderr: ' + errors.join('\n').slice(0, 500),
          ],
        ));
      }
    });

    proc.on('error', (err) => {
      settle(createErrorResponse(
        `Failed to spawn Godot: ${err.message}`,
        ['Verify GODOT_PATH is correct'],
      ));
    });
  });
}

// ─── Install Test Bridge ────────────────────────────────────────────────────

async function handleInstallTestBridge(
  params: Record<string, any>,
  createErrorResponse: (msg: string, solutions?: string[]) => any,
): Promise<any> {
  const projectPath = params.projectPath;
  if (!projectPath) {
    return createErrorResponse('Missing required parameter: project_path');
  }
  const installPathErr = validatePath(projectPath);
  if (installPathErr) {
    return createErrorResponse(`Invalid project_path: ${installPathErr}`);
  }

  const projectGodot = join(projectPath, 'project.godot');
  if (!existsSync(projectGodot)) {
    return createErrorResponse(
      `No project.godot found at ${projectPath}`,
      ['Verify the path points to a valid Godot project directory'],
    );
  }

  // 1. Copy test_bridge.gd to project
  const sourceGd = join(__dirname, 'scripts', 'test_bridge.gd');
  if (!existsSync(sourceGd)) {
    return createErrorResponse(
      'test_bridge.gd not found in godot-mcp build',
      ['Run npm run build first'],
    );
  }

  const targetDir = join(projectPath, 'addons', 'test_bridge');
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(sourceGd, join(targetDir, 'TestBridge.gd'));

  // 2. Update project.godot — append-only strategy
  let content = readFileSync(projectGodot, 'utf-8');

  const autoloadSection = /^\[autoload\]\s*$/m;
  const testBridgeLine = 'TestBridge="*res://addons/test_bridge/TestBridge.gd"';

  if (autoloadSection.test(content)) {
    // Check if TestBridge already registered
    if (content.includes('TestBridge=')) {
      // Already installed — update the line in case the path changed
      content = content.replace(
        /^TestBridge=.*$/m,
        testBridgeLine,
      );
    } else {
      // Append after [autoload] header
      content = content.replace(
        /^\[autoload\]\s*$/m,
        `[autoload]\n${testBridgeLine}`,
      );
    }
  } else {
    // No autoload section — append at end
    content += `\n[autoload]\n\n${testBridgeLine}\n`;
  }

  writeFileSync(projectGodot, content, 'utf-8');

  return successResponse({
    installed: true,
    path: 'res://addons/test_bridge/TestBridge.gd',
    autoload_registered: true,
  });
}
