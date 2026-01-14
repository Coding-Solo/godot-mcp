# Godot MCP - Detailed Improvement Specifications

> **Document Type**: Technical Specification
> **Version**: 1.0
> **Last Updated**: 2026-01-11

---

## Overview

This document provides detailed specifications for new tools and improvements to the godot-mcp project, organized by priority and implementation complexity.

---

## Priority 1: Critical Features

### 1.1 GDScript File Operations

#### Tool: `create_script`

**Purpose**: Create new GDScript files with proper structure

```typescript
interface CreateScriptParams {
  projectPath: string;      // Required: Path to Godot project
  scriptPath: string;       // Required: Path for new script (relative to project)
  className?: string;       // Optional: class_name for global registration
  extends?: string;         // Optional: Base class (default: "Node")
  content?: string;         // Optional: Initial script content
  template?: string;        // Optional: Template name ("singleton", "state_machine", etc.)
}

interface CreateScriptResult {
  success: boolean;
  scriptPath: string;
  absolutePath: string;
  registered: boolean;      // true if class_name was added
}
```

**Implementation Notes**:
- Validate scriptPath ends with `.gd`
- Create parent directories if needed
- Support common templates:
  - `singleton`: Autoload pattern
  - `state_machine`: FSM pattern
  - `component`: Component pattern
  - `resource`: Custom resource

**Example Usage**:
```json
{
  "projectPath": "/path/to/project",
  "scriptPath": "scripts/player/PlayerController.gd",
  "className": "PlayerController",
  "extends": "CharacterBody2D",
  "content": "@export var speed: float = 200.0\n@export var jump_force: float = -400.0"
}
```

---

#### Tool: `modify_script`

**Purpose**: Modify existing GDScript files programmatically

```typescript
interface ModifyScriptParams {
  projectPath: string;
  scriptPath: string;
  modifications: ScriptModification[];
}

type ScriptModification = 
  | AddFunctionMod
  | AddVariableMod
  | AddSignalMod
  | ReplaceFunctionMod
  | RemoveFunctionMod
  | AddExportMod;

interface AddFunctionMod {
  type: "add_function";
  name: string;
  params?: string;          // e.g., "delta: float, input: Vector2"
  returnType?: string;      // e.g., "void", "bool", "Vector2"
  body: string;
  isAsync?: boolean;        // Add async keyword
  position?: "end" | "after_ready" | "after_init";
}

interface AddVariableMod {
  type: "add_variable";
  name: string;
  varType?: string;
  defaultValue?: string;
  isExport?: boolean;
  exportHint?: string;      // e.g., "range(0, 100)"
  isOnready?: boolean;
}

interface AddSignalMod {
  type: "add_signal";
  name: string;
  params?: string;          // e.g., "damage: int, source: Node"
}
```

**Example Usage**:
```json
{
  "projectPath": "/path/to/project",
  "scriptPath": "scripts/player/PlayerController.gd",
  "modifications": [
    {
      "type": "add_variable",
      "name": "health",
      "varType": "int",
      "defaultValue": "100",
      "isExport": true
    },
    {
      "type": "add_signal",
      "name": "health_changed",
      "params": "new_health: int"
    },
    {
      "type": "add_function",
      "name": "take_damage",
      "params": "amount: int",
      "returnType": "void",
      "body": "health -= amount\nhealth_changed.emit(health)\nif health <= 0:\n\tdie()"
    }
  ]
}
```

---

#### Tool: `get_script_info`

**Purpose**: Analyze GDScript file structure

```typescript
interface GetScriptInfoParams {
  projectPath: string;
  scriptPath: string;
  includeInherited?: boolean;  // Include parent class members
}

interface ScriptInfo {
  path: string;
  className: string | null;
  extends: string;
  signals: SignalInfo[];
  variables: VariableInfo[];
  functions: FunctionInfo[];
  constants: ConstantInfo[];
  enums: EnumInfo[];
  innerClasses: string[];
  dependencies: string[];      // Other scripts/resources referenced
}

interface SignalInfo {
  name: string;
  params: ParamInfo[];
  line: number;
}

interface FunctionInfo {
  name: string;
  params: ParamInfo[];
  returnType: string | null;
  isVirtual: boolean;         // Starts with _
  isAsync: boolean;
  line: number;
}
```

---

### 1.2 Project Export/Build

#### Tool: `export_project`

**Purpose**: Export project for distribution

```typescript
interface ExportProjectParams {
  projectPath: string;
  preset: string;             // Export preset name
  outputPath: string;         // Output file path
  debug?: boolean;            // Debug or release build
  pck_only?: boolean;         // Export PCK/ZIP only
  include_timestamp?: boolean;
}

interface ExportResult {
  success: boolean;
  outputPath: string;
  size: number;               // File size in bytes
  warnings: string[];
  errors: string[];
  duration: number;           // Export time in ms
}
```

**Implementation Notes**:
- Use `--export-release` or `--export-debug` CLI flags
- Set appropriate timeout (5+ minutes for large projects)
- Capture and parse stderr for warnings/errors
- Verify output file exists after export

---

#### Tool: `list_export_presets`

**Purpose**: List available export presets

```typescript
interface ListExportPresetsParams {
  projectPath: string;
}

interface ExportPreset {
  name: string;
  platform: string;           // "Windows Desktop", "Linux", "Android", etc.
  runnable: boolean;          // Has valid export template
  custom_features: string[];
  path: string;               // Default export path
}

interface ListExportPresetsResult {
  presets: ExportPreset[];
  missingTemplates: string[]; // Platforms without templates
}
```

**Implementation Notes**:
- Parse `export_presets.cfg` file
- Check for installed export templates

---

#### Tool: `create_export_preset`

**Purpose**: Create new export preset

```typescript
interface CreateExportPresetParams {
  projectPath: string;
  name: string;
  platform: string;
  options?: Record<string, any>;  // Platform-specific options
}
```

---

### 1.3 Enhanced Node Operations

#### Tool: `delete_node`

**Purpose**: Remove node from scene

```typescript
interface DeleteNodeParams {
  projectPath: string;
  scenePath: string;
  nodePath: string;           // Path like "root/Player/Sprite2D"
  deleteChildren?: boolean;   // Delete children or reparent to parent (default: true)
}
```

---

#### Tool: `duplicate_node`

**Purpose**: Duplicate node within scene

```typescript
interface DuplicateNodeParams {
  projectPath: string;
  scenePath: string;
  nodePath: string;
  newName: string;
  parentPath?: string;        // Different parent (default: same parent)
  includeScripts?: boolean;   // Copy attached scripts
  flags?: number;             // Godot DUPLICATE_* flags
}
```

---

#### Tool: `reparent_node`

**Purpose**: Move node to different parent

```typescript
interface ReparentNodeParams {
  projectPath: string;
  scenePath: string;
  nodePath: string;
  newParentPath: string;
  keepGlobalTransform?: boolean;  // Preserve world position
}
```

---

#### Tool: `list_scene_nodes`

**Purpose**: Get complete scene tree structure

```typescript
interface ListSceneNodesParams {
  projectPath: string;
  scenePath: string;
  depth?: number;             // Max depth (-1 for all)
  includeProperties?: boolean;
}

interface SceneNodeInfo {
  name: string;
  type: string;
  path: string;
  script: string | null;
  children: SceneNodeInfo[];
  properties?: Record<string, any>;
  signals?: string[];
}
```

---

#### Tool: `get_node_info`

**Purpose**: Get detailed node information

```typescript
interface GetNodeInfoParams {
  projectPath: string;
  scenePath: string;
  nodePath: string;
}

interface NodeInfo {
  name: string;
  type: string;
  path: string;
  script: string | null;
  properties: Record<string, any>;
  groups: string[];
  signals: SignalConnectionInfo[];
  metadata: Record<string, any>;
}
```

---

#### Tool: `set_node_properties`

**Purpose**: Bulk update node properties

```typescript
interface SetNodePropertiesParams {
  projectPath: string;
  scenePath: string;
  nodePath: string;
  properties: Record<string, any>;
}
```

**Example Usage**:
```json
{
  "projectPath": "/path/to/project",
  "scenePath": "scenes/player.tscn",
  "nodePath": "root/Player",
  "properties": {
    "position": {"x": 100, "y": 200},
    "scale": {"x": 2, "y": 2},
    "modulate": {"r": 1, "g": 0.5, "b": 0.5, "a": 1},
    "z_index": 10
  }
}
```

---

## Priority 2: High Value Features

### 2.1 Project Settings Management

#### Tool: `get_project_setting`

```typescript
interface GetProjectSettingParams {
  projectPath: string;
  setting: string;            // e.g., "application/config/name"
}
```

---

#### Tool: `set_project_setting`

```typescript
interface SetProjectSettingParams {
  projectPath: string;
  setting: string;
  value: any;
  type?: string;              // Force type (auto-detected if omitted)
}
```

---

#### Tool: `add_input_action`

**Purpose**: Add input action to InputMap

```typescript
interface AddInputActionParams {
  projectPath: string;
  actionName: string;
  events: InputEvent[];
  deadzone?: number;
}

type InputEvent = 
  | { type: "key"; keycode: string; modifiers?: KeyModifiers }
  | { type: "mouse_button"; button: number; modifiers?: KeyModifiers }
  | { type: "joypad_button"; button: number; device?: number }
  | { type: "joypad_axis"; axis: number; value: number; device?: number };

interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}
```

**Example Usage**:
```json
{
  "projectPath": "/path/to/project",
  "actionName": "jump",
  "events": [
    { "type": "key", "keycode": "Space" },
    { "type": "joypad_button", "button": 0 }
  ],
  "deadzone": 0.5
}
```

---

#### Tool: `add_autoload`

**Purpose**: Register singleton/autoload

```typescript
interface AddAutoloadParams {
  projectPath: string;
  name: string;               // Singleton name
  path: string;               // Script or scene path
  enabled?: boolean;
}
```

---

#### Tool: `set_main_scene`

```typescript
interface SetMainSceneParams {
  projectPath: string;
  scenePath: string;
}
```

---

### 2.2 Signal & Connection Management

#### Tool: `connect_signal`

```typescript
interface ConnectSignalParams {
  projectPath: string;
  scenePath: string;
  sourceNodePath: string;
  signalName: string;
  targetNodePath: string;
  methodName: string;
  flags?: number;             // ConnectFlags
}
```

---

#### Tool: `disconnect_signal`

```typescript
interface DisconnectSignalParams {
  projectPath: string;
  scenePath: string;
  sourceNodePath: string;
  signalName: string;
  targetNodePath: string;
  methodName: string;
}
```

---

#### Tool: `list_connections`

```typescript
interface ListConnectionsParams {
  projectPath: string;
  scenePath: string;
  nodePath?: string;          // Filter by node (all if omitted)
}

interface ConnectionInfo {
  source: string;
  signal: string;
  target: string;
  method: string;
  flags: number;
}
```

---

### 2.3 Asset Import System

#### Tool: `set_import_options`

```typescript
interface SetImportOptionsParams {
  projectPath: string;
  resourcePath: string;
  options: Record<string, any>;
}
```

**Example Usage** (for texture):
```json
{
  "projectPath": "/path/to/project",
  "resourcePath": "assets/sprites/player.png",
  "options": {
    "compress/mode": 0,
    "mipmaps/generate": false,
    "process/fix_alpha_border": true,
    "detect_3d/compress_to": 0
  }
}
```

---

#### Tool: `reimport_resource`

```typescript
interface ReimportResourceParams {
  projectPath: string;
  resourcePath: string | string[];  // Single or multiple paths
}
```

---

#### Tool: `get_import_options`

```typescript
interface GetImportOptionsParams {
  projectPath: string;
  resourcePath: string;
}

interface ImportOptions {
  importer: string;           // "texture", "scene", "audio", etc.
  options: Record<string, any>;
  source_file: string;
  dest_files: string[];
}
```

---

## Priority 3: Quality of Life Features

### 3.1 Animation Support

#### Tool: `create_animation`

```typescript
interface CreateAnimationParams {
  projectPath: string;
  scenePath: string;
  playerNodePath: string;     // AnimationPlayer node
  animationName: string;
  length?: number;            // Duration in seconds
  loop_mode?: "none" | "linear" | "pingpong";
  step?: number;              // Keyframe snap step
}
```

---

#### Tool: `add_animation_track`

```typescript
interface AddAnimationTrackParams {
  projectPath: string;
  scenePath: string;
  playerNodePath: string;
  animationName: string;
  track: AnimationTrackConfig;
}

type AnimationTrackConfig = 
  | PropertyTrack
  | MethodTrack
  | BezierTrack
  | AudioTrack
  | AnimationTrack;

interface PropertyTrack {
  type: "property";
  nodePath: string;
  property: string;           // e.g., "position", "modulate"
  keyframes: PropertyKeyframe[];
}

interface PropertyKeyframe {
  time: number;
  value: any;
  transition?: number;        // Easing type
  easing?: number;
}
```

---

### 3.2 Resource Creation

#### Tool: `create_resource`

**Purpose**: Create custom resource files

```typescript
interface CreateResourceParams {
  projectPath: string;
  resourcePath: string;
  resourceType: string;       // Class name
  properties?: Record<string, any>;
  script?: string;            // Custom resource script
}
```

---

#### Tool: `create_shader`

```typescript
interface CreateShaderParams {
  projectPath: string;
  shaderPath: string;
  shaderType: "canvas_item" | "spatial" | "particles" | "sky" | "fog";
  code?: string;
  template?: string;          // Predefined template name
}
```

---

#### Tool: `create_material`

```typescript
interface CreateMaterialParams {
  projectPath: string;
  materialPath: string;
  materialType: "StandardMaterial3D" | "ShaderMaterial" | "CanvasItemMaterial" | "ParticleProcessMaterial";
  properties?: Record<string, any>;
  shader?: string;            // For ShaderMaterial
}
```

---

### 3.3 2D Tile Operations

#### Tool: `create_tileset`

```typescript
interface CreateTilesetParams {
  projectPath: string;
  tilesetPath: string;
  sources: TilesetSource[];
}

interface TilesetSource {
  texture: string;            // Texture path
  tileSize: { x: number; y: number };
  separation?: { x: number; y: number };
  offset?: { x: number; y: number };
  useTextureRegion?: boolean;
}
```

---

#### Tool: `set_tilemap_cells`

```typescript
interface SetTilemapCellsParams {
  projectPath: string;
  scenePath: string;
  tilemapNodePath: string;
  layer?: number;
  cells: TilemapCell[];
}

interface TilemapCell {
  coords: { x: number; y: number };
  sourceId: number;
  atlasCoords: { x: number; y: number };
  alternativeTile?: number;
}
```

---

## Priority 4: Advanced Features

### 4.1 Runtime Connection (WebSocket Mode)

#### Architecture

```
┌─────────────────┐                    ┌─────────────────┐
│   MCP Server    │◄──── WebSocket ───►│ Godot Runtime   │
│   (Node.js)     │                    │ (Running Game)  │
└─────────────────┘                    └─────────────────┘
```

#### New Tools for Runtime Mode

```typescript
// Connect to running game
interface ConnectRuntimeParams {
  host?: string;              // Default: "127.0.0.1"
  port?: number;              // Default: 7777
}

// Inspect scene tree at runtime
interface InspectSceneTreeParams {
  depth?: number;
  includeProperties?: boolean;
}

// Modify property at runtime
interface SetRuntimePropertyParams {
  nodePath: string;
  property: string;
  value: any;
}

// Call method at runtime
interface CallRuntimeMethodParams {
  nodePath: string;
  method: string;
  args?: any[];
}

// Subscribe to signal
interface WatchSignalParams {
  nodePath: string;
  signal: string;
}

// Get performance metrics
interface GetMetricsParams {
  metrics: string[];          // "fps", "memory", "objects", etc.
}
```

---

### 4.2 Plugin Management

#### Tool: `list_plugins`

```typescript
interface ListPluginsParams {
  projectPath: string;
}

interface PluginInfo {
  name: string;
  path: string;
  enabled: boolean;
  version: string;
  author: string;
  description: string;
}
```

---

#### Tool: `enable_plugin`

```typescript
interface EnablePluginParams {
  projectPath: string;
  pluginName: string;
}
```

---

#### Tool: `install_asset_lib_plugin`

```typescript
interface InstallAssetLibPluginParams {
  projectPath: string;
  assetId: number;            // Asset Library ID
  installPath?: string;       // Default: "addons/"
}
```

---

### 4.3 Debugging Tools

#### Tool: `set_breakpoint`

```typescript
interface SetBreakpointParams {
  projectPath: string;
  scriptPath: string;
  line: number;
  enabled?: boolean;
  condition?: string;         // GDScript expression
}
```

---

#### Tool: `get_stack_trace`

```typescript
interface GetStackTraceParams {
  // Requires runtime connection
}

interface StackFrame {
  function: string;
  file: string;
  line: number;
  locals: Record<string, any>;
}
```

---

## Implementation Priority Matrix

| Feature | Impact | Effort | Priority Score |
|---------|--------|--------|----------------|
| create_script | 10 | 3 | 3.33 |
| modify_script | 10 | 5 | 2.00 |
| export_project | 9 | 3 | 3.00 |
| delete_node | 8 | 2 | 4.00 |
| list_scene_nodes | 8 | 2 | 4.00 |
| set_project_setting | 7 | 2 | 3.50 |
| connect_signal | 7 | 3 | 2.33 |
| create_animation | 6 | 5 | 1.20 |
| runtime_connection | 10 | 8 | 1.25 |

**Priority Score = Impact / Effort** (higher is better)

---

## Testing Requirements

### Unit Tests

Each tool should have tests for:
1. **Success case**: Valid parameters produce expected result
2. **Missing params**: Proper error when required params missing
3. **Invalid paths**: Proper error for non-existent files
4. **Type validation**: Proper error for wrong parameter types
5. **Edge cases**: Empty arrays, special characters, long paths

### Integration Tests

1. **Workflow tests**: Complete scenarios (create project → add scene → add script → export)
2. **Concurrency tests**: Multiple operations in sequence
3. **Error recovery**: Server continues working after errors

### Example Test Structure

```typescript
describe('create_script', () => {
  it('should create script with class_name', async () => {
    const result = await server.callTool('create_script', {
      projectPath: testProjectPath,
      scriptPath: 'scripts/test.gd',
      className: 'TestClass',
      extends: 'Node',
    });
    
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(testProjectPath, 'scripts/test.gd'))).toBe(true);
    
    const content = fs.readFileSync(path.join(testProjectPath, 'scripts/test.gd'), 'utf-8');
    expect(content).toContain('class_name TestClass');
    expect(content).toContain('extends Node');
  });
  
  it('should fail for invalid project path', async () => {
    const result = await server.callTool('create_script', {
      projectPath: '/nonexistent/path',
      scriptPath: 'test.gd',
    });
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not a valid Godot project');
  });
});
```

---

## Migration Guide

### From Current Version

Existing tools remain unchanged. New tools are additive.

### Breaking Changes (if any)

None planned for Priority 1-3 features.

---

*This specification document provides the technical foundation for implementing godot-mcp enhancements.*
