@tool
extends EditorPlugin

## Auto Reload Plugin for Godot MCP
## Automatically reloads scenes and scripts when modified externally
## 
## Features:
## - Auto-detects external file changes (scenes, scripts, resources)
## - Reloads without confirmation popup
## - Lightweight 1-second polling (negligible performance impact)
## - Perfect for MCP integration workflow

var check_interval: float = 1.0  # Check every 1 second
var timer: Timer
var watched_files: Dictionary = {}  # {path: last_modified_time}
var editor_interface: EditorInterface

# File extensions to watch
var watched_extensions: Array[String] = [".tscn", ".scn", ".gd", ".tres", ".res"]

func _enter_tree() -> void:
	editor_interface = get_editor_interface()
	
	# Create timer for periodic file checking
	timer = Timer.new()
	timer.wait_time = check_interval
	timer.timeout.connect(_check_for_changes)
	add_child(timer)
	timer.start()
	
	# Initial scan of open scenes
	_update_watched_files()
	
	print("[Godot MCP - AutoReload] Plugin activated - watching for external changes")

func _exit_tree() -> void:
	if timer:
		timer.stop()
		timer.queue_free()
	print("[Godot MCP - AutoReload] Plugin deactivated")

func _update_watched_files() -> void:
	# Get currently edited scene
	var edited_scene = editor_interface.get_edited_scene_root()
	if edited_scene and edited_scene.scene_file_path:
		var path = edited_scene.scene_file_path
		if not watched_files.has(path):
			watched_files[path] = _get_modified_time(path)
		
		# Also watch attached scripts
		_watch_node_scripts(edited_scene)

func _watch_node_scripts(node: Node) -> void:
	# Watch the script attached to this node
	var script = node.get_script()
	if script and script.resource_path:
		var path = script.resource_path
		if not watched_files.has(path):
			watched_files[path] = _get_modified_time(path)
	
	# Recursively watch children
	for child in node.get_children():
		_watch_node_scripts(child)

func _get_modified_time(path: String) -> int:
	var global_path = ProjectSettings.globalize_path(path)
	if FileAccess.file_exists(global_path):
		return FileAccess.get_modified_time(global_path)
	return 0

func _check_for_changes() -> void:
	_update_watched_files()
	
	var files_to_reload: Array = []
	var scripts_to_reload: Array = []
	
	for path in watched_files.keys():
		var current_time = _get_modified_time(path)
		var last_time = watched_files[path]
		
		if current_time > last_time:
			if path.ends_with(".gd"):
				scripts_to_reload.append(path)
			else:
				files_to_reload.append(path)
			watched_files[path] = current_time
	
	# Reload changed scripts first
	for path in scripts_to_reload:
		_reload_script(path)
	
	# Then reload changed scenes
	for path in files_to_reload:
		_reload_scene(path)

func _reload_script(path: String) -> void:
	print("[Godot MCP - AutoReload] Script changed: ", path)
	
	# Reload the script resource
	var script = load(path)
	if script:
		ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_REPLACE)
		print("[Godot MCP - AutoReload] Script reloaded: ", path)

func _reload_scene(path: String) -> void:
	print("[Godot MCP - AutoReload] Scene changed: ", path)
	
	# Check if this is the currently edited scene
	var edited_scene = editor_interface.get_edited_scene_root()
	if edited_scene and edited_scene.scene_file_path == path:
		# Reload the current scene
		editor_interface.reload_scene_from_path(path)
		print("[Godot MCP - AutoReload] Scene reloaded: ", path)

# Public API for configuration
func set_check_interval(interval: float) -> void:
	check_interval = interval
	if timer:
		timer.wait_time = interval

func add_watched_extension(ext: String) -> void:
	if not watched_extensions.has(ext):
		watched_extensions.append(ext)

func clear_watched_files() -> void:
	watched_files.clear()
