# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

godot-mcp is an MCP (Model Context Protocol) server that lets AI assistants interact with the Godot game engine. It provides tools for launching the editor, running projects, managing scenes/nodes, and capturing debug output. Written in TypeScript, compiled to a Node.js executable.

## Build & Development Commands

```bash
npm install           # Install dependencies
npm run build         # TypeScript compile + post-build (chmod, copy GDScript)
npm run watch         # Watch mode with auto-rebuild
npm run inspector     # Launch MCP Inspector for interactive testing
```

There is no automated test suite. Use `npm run inspector` for manual testing. Set `DEBUG=true` for verbose server logging.

## Architecture

### Core server + E2E bridge modules

The MCP server core lives in `src/index.ts` as the `GodotServer` class. Complex Godot operations delegate to `src/scripts/godot_operations.gd`, a headless GDScript executed via Godot's CLI. E2E testing tools are in separate modules.

**Three execution paths:**
- **Direct CLI**: Simple operations (launch editor, get version, run project) spawn Godot directly
- **Bundled GDScript**: Complex operations (create scene, add node, load sprite, export mesh library) pass a JSON params blob to `godot_operations.gd` via `execFile()`
- **WebSocket bridge**: E2E testing tools connect to a running Godot game via `src/bridge.ts` ↔ `src/scripts/test_bridge.gd` over JSON-RPC/WebSocket

### Key files

| File | Purpose |
|------|---------|
| `src/index.ts` | GodotServer class, core 15 tools, wires in E2E tools |
| `src/bridge.ts` | BridgeClient — WebSocket client + JSON-RPC transport |
| `src/e2e-tools.ts` | 25 E2E tool schemas + handlers, ServerContext interface |
| `src/scripts/godot_operations.gd` | Headless GDScript for scene/node operations |
| `src/scripts/test_bridge.gd` | TestBridge autoload — WebSocket server inside running Godot game |

### Key class: GodotServer

```
GodotServer
  ├── detectGodotPath()        # Platform-aware auto-detection (macOS/Windows/Linux)
  ├── executeOperation()       # Runs godot_operations.gd with operation name + JSON params
  ├── setupToolHandlers()      # Registers all 40 MCP tools (15 core + 25 E2E)
  ├── normalizeParameters()    # Accepts both snake_case and camelCase input
  ├── handle*(args)            # One handler method per core MCP tool
  └── bridge: BridgeClient     # WebSocket client for E2E tools
```

### E2E Testing Bridge

`BridgeClient` (src/bridge.ts) manages WebSocket connection to `TestBridge.gd` running inside a Godot game. The bridge uses JSON-RPC with UUID-based request tracking and per-request timeouts.

**TestBridge.gd** is a Godot autoload activated by `--test-bridge` CLI flag. It runs a `TCPServer` + `WebSocketPeer` server, processes requests in `_process()` (non-blocking), and supports async handlers via `_pending_responses`.

**Safety**: `--unsafe` flag required for `evaluate_expression`, `wait_for_condition`, and dangerous methods in `call_method`. Singleton names reject path traversal. `find_nodes` capped at 1000 results.

### Parameter normalization pipeline

Tool input (either convention) → normalize to camelCase → process → convert to snake_case → pass to GDScript. The `parameterMappings` dict drives this bidirectional conversion.

### Process management

Only one active Godot process at a time. `activeProcess` tracks the spawned process and captures stdout/stderr for retrieval via `get_debug_output`.

### Build post-processing

`scripts/build.js` runs after `tsc`: makes `build/index.js` executable and copies GDScript files (`godot_operations.gd`, `test_bridge.gd`) into `build/scripts/`.

## MCP Tools (40 total)

### Core Tools (15)

| Category | Tools |
|---|---|
| Discovery | `list_projects`, `get_project_info`, `get_godot_version` |
| Execution | `launch_editor`, `run_project`, `get_debug_output`, `stop_project` |
| Scene ops | `create_scene`, `add_node`, `save_scene`, `load_sprite` |
| Advanced | `export_mesh_library`, `get_uid`, `update_project_uids` |

### E2E Testing Tools (25)

| Category | Tools |
|---|---|
| Connection | `connect_to_game`, `disconnect_from_game`, `get_bridge_status` |
| Orchestration | `install_test_bridge`, `run_project_with_bridge` |
| Scene tree | `get_tree`, `find_nodes`, `get_node_properties`, `set_node_property`, `call_method` |
| Game state | `get_singleton`, `evaluate_expression` (unsafe), `get_performance_metrics` |
| Input | `send_key`, `send_mouse_click`, `send_mouse_drag`, `send_text` |
| Waiting | `wait_for_signal`, `wait_for_condition` (unsafe), `wait_for_node`, `wait_for_property` |
| Visual | `take_screenshot`, `get_viewport_info` |
| Scene control | `reset_scene`, `load_scene` |

## Adding New Tools

### Core tools (in src/index.ts)
1. Define tool schema in `setupToolHandlers()` with name, description, and `inputSchema`
2. Add a `handle*` method following the existing pattern (validate → execute → return content/error)
3. Wire the handler in the `CallToolRequestSchema` switch
4. Use `createErrorResponse()` for errors (includes suggested solutions)
5. Update README.md

### E2E tools (in src/e2e-tools.ts)
1. Add tool schema to `getE2EToolSchemas()`
2. Add handler case in `handleE2ETool()`
3. For simple bridge pass-through: use `handleBridgePassthrough()` with capability checking
4. For wait tools: use `handleWaitTool()` with extended timeout
5. Add GDScript handler in `src/scripts/test_bridge.gd` (`_handle_<method_name>`)
6. Add parameter mappings to `getE2EParameterMappings()` if needed

## Security Patterns

- All subprocess execution uses `execFile()` with argument arrays (no shell interpolation)
- Long-lived game processes use `spawn()` (for `run_project_with_bridge`)
- Path validation rejects `..` traversal sequences
- Godot path is validated via actual execution before use, with results cached in `validatedPaths`
- E2E bridge: `--unsafe` flag gates `evaluate_expression`, `wait_for_condition`, and dangerous methods in `call_method`
- Singleton name validation rejects `..` and `/` to prevent traversal
- `find_nodes` results capped at 1000 to prevent memory exhaustion

## Environment Variables

- `GODOT_PATH` - Override auto-detected Godot executable location
- `DEBUG=true` - Enable verbose stderr logging

## Key Conventions

- Logging goes to `console.error()` (stderr) to avoid interfering with JSON-RPC on stdout
- ES modules (`"type": "module"` in package.json)
- TypeScript strict mode, target ES2022
- Conventional commits: `feat`, `fix`, `chore`, `refactor`
