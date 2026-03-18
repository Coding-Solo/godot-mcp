# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GodotMCP is a TypeScript MCP server that lets AI assistants control the Godot game engine — launching the editor, running projects, capturing debug output, and manipulating scenes.

## Development Commands

Requires Node.js 18+ and npm.

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript → build/index.js
npm run watch      # Watch mode for development
npm run inspector  # Launch MCP inspector UI to test tools
```

Run the built server directly:
```bash
node build/index.js
```

Environment variables:
```bash
GODOT_PATH=/path/to/godot   # Override auto-detection of Godot executable
DEBUG=true                   # Enable verbose server-side logging (goes to stderr)
```

There are no test commands configured in the project.

## Architecture

### Two Execution Modes

**Direct CLI commands** — Simple operations (launch editor, get version, list projects, run/stop project) invoke the Godot executable directly via `execFile`/`spawn`.

**Bundled GDScript** — Complex scene operations (create scene, add node, load sprite, export mesh library, save scene, get UID, update UIDs) are handled by `src/scripts/godot_operations.gd`, a single headless GDScript that accepts an operation name and JSON params via CLI args. This avoids creating temporary script files.

### Key Files

- `src/index.ts` (2,196 lines) — The entire MCP server: `GodotServer` class, all 15 tool definitions, Godot path auto-detection, process lifecycle management
- `src/scripts/godot_operations.gd` — Bundled GDScript run headlessly for scene manipulation; accepts `<operation> <json_params>` as CLI arguments
- `scripts/build.js` — Post-TypeScript build step that copies `godot_operations.gd` into `build/scripts/` so it's available at runtime relative to `build/index.js`

### GodotServer Class (src/index.ts)

- `detectGodotPath()` — Auto-detects Godot executable across macOS/Windows/Linux common paths; respects `GODOT_PATH` env var
- `executeOperation()` — Converts camelCase params → snake_case, serializes to JSON, invokes Godot headlessly with the bundled GDScript
- `parameterMappings` — Bidirectional snake_case ↔ camelCase param normalization so tools accept either format
- `activeProcess` — Tracks a single running Godot project process for `run_project`/`stop_project`/`get_debug_output`

### MCP Tools (15 total)

| Tool | Mode |
|------|------|
| `launch_editor` | Direct CLI |
| `run_project` | Direct CLI (spawns persistent process) |
| `get_debug_output` | Reads from `activeProcess` |
| `stop_project` | Kills `activeProcess` |
| `get_godot_version` | Direct CLI |
| `list_projects` | Direct CLI |
| `get_project_info` | Direct CLI |
| `create_scene` | Bundled GDScript |
| `add_node` | Bundled GDScript |
| `load_sprite` | Bundled GDScript |
| `export_mesh_library` | Bundled GDScript |
| `save_scene` | Bundled GDScript |
| `get_uid` | Bundled GDScript (Godot 4.4+) |
| `update_project_uids` | Bundled GDScript (Godot 4.4+) |

### Adding New Tools

1. Add a new operation handler in `src/scripts/godot_operations.gd` (match branch in `_init()`)
2. Register the tool in `setupToolHandlers()` in `src/index.ts` with its input schema
3. Add a `case` in the `CallToolRequestSchema` handler that calls `executeOperation()` or a direct CLI method
4. If the tool has new parameter names, add them to `parameterMappings` for snake_case support
5. Run `npm run build` — the build script automatically copies `godot_operations.gd` to `build/scripts/`
