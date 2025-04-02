# Project Roadmap: Godot MCP Server

## Goals
- Provide robust tools for interacting with the Godot engine via MCP.
- Ensure reliable communication between Node.js server and Godot scripts.

## Features
- [x] `create_scene`: Create new Godot scene files. (Fixed RID leak)
- [x] `add_node`: Add nodes to existing scenes. (Fixed RID leak)
- [x] `load_sprite`: Load textures onto sprite nodes. (Fixed RID leak)
- [x] `export_mesh_library`: Export meshes to a MeshLibrary. (Fixed RID leak)
- [x] `save_scene`: Save scene changes. (Fixed RID leak)
- [ ] `get_uid`: Retrieve resource UIDs.
- [x] `resave_resources`: Update project UIDs. (Fixed argument/output handling)
- [ ] `launch_editor`: Launch the Godot editor.
- [ ] `run_project`: Run a Godot project.
- [ ] `get_debug_output`: Capture debug output.
- [ ] `stop_project`: Stop a running project.
- [ ] `get_godot_version`: Get Godot version.
- [ ] `list_projects`: List projects in a directory.
- [ ] `get_project_info`: Get project scene/script info.

## Completion Criteria
- All defined tools function correctly across platforms (especially Windows).
- Argument passing between Node.js and Godot is reliable.
- Error handling is robust.

## Progress Tracker
- Initial setup and basic tool implementation.
- Debugging and fixing argument passing for `create_scene`.

## Completed Tasks
- [x] Debug and fix JSON argument passing for `create_scene` tool.
- [x] Correct node ownership issue in `create_scene` GDScript function.
- [x] Debug and fix resource leaks and node duplication issues for `add_node` tool.
- [x] Debug and fix RID allocation leaks in `create_scene`, `load_sprite`, `export_mesh_library`, and `save_scene` by ensuring `scene_root.free()` is called.
- [x] Debug and fix argument handling and success reporting for `resave_resources` tool.
