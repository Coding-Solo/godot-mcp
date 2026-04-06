#!/usr/bin/env -S godot --headless --script
extends SceneTree

var debug_mode := false
var _sdk_cache: Dictionary = {}
var _sdk_root_cache := ""


func _init() -> void:
	var request := _parse_request(OS.get_cmdline_args())
	if not request.get("ok", false):
		_emit_result(request)
		quit(1)
		return

	var operation: String = str(request.get("data", {}).get("operation", ""))
	var params: Dictionary = request.get("data", {}).get("params", {})
	_log_debug("Executing operation: %s" % operation)

	var result = _dispatch(operation, params)
	if not (result is Dictionary):
		result = _err("Operation returned an invalid result", "ERR_INVALID_RESULT")

	if not result.get("ok", false):
		printerr("[ERROR] %s" % str(result.get("error", "Unknown error")))

	_emit_result(result)
	quit(0 if result.get("ok", false) else 1)


func _parse_request(args: Array) -> Dictionary:
	debug_mode = "--debug-godot" in args

	var script_index := args.find("--script")
	if script_index == -1:
		return _err("Could not find --script argument", "ERR_INVALID_ARGS")

	var operation_index := script_index + 2
	var params_index := script_index + 3
	if args.size() <= params_index:
		return _err(
			"Usage: godot --headless --script godot_operations.gd <operation> <json_params>",
			"ERR_INVALID_ARGS"
		)

	var params_json := str(args[params_index])
	var json := JSON.new()
	var parse_error := json.parse(params_json)
	if parse_error != OK:
		return _err(
			"Failed to parse JSON parameters: %s" % json.get_error_message(),
			"ERR_INVALID_JSON",
			{"line": json.get_error_line()}
		)

	var params = json.get_data()
	if not (params is Dictionary):
		return _err("Parameters must be a JSON object", "ERR_INVALID_JSON")

	return _ok({
		"operation": str(args[operation_index]),
		"params": params,
	})


func _dispatch(operation: String, params: Dictionary) -> Dictionary:
	var scene_result = _dispatch_scene_ops(operation, params)
	if scene_result != null:
		return scene_result

	var script_result = _dispatch_script_ops(operation, params)
	if script_result != null:
		return script_result

	var resource_result = _dispatch_resource_ops(operation, params)
	if resource_result != null:
		return resource_result

	var validation_result = _dispatch_validation_ops(operation, params)
	if validation_result != null:
		return validation_result

	var config_result = _dispatch_project_config_ops(operation, params)
	if config_result != null:
		return config_result

	var file_result = _dispatch_file_system_ops(operation, params)
	if file_result != null:
		return file_result

	var editor_result = _dispatch_editor_ops(operation, params)
	if editor_result != null:
		return editor_result

	return _err("Unknown operation: %s" % operation, "ERR_UNKNOWN_OPERATION")


func _dispatch_scene_ops(operation: String, params: Dictionary) -> Variant:
	match operation:
		"create_scene_from_json":
			return _sdk_call("scene_ops.gd", "create_scene_from_json", [params.get("scene", {})])
		"save_scene":
			return _sdk_call("scene_ops.gd", "save_scene", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_resource_path(str(params.get("new_path", ""))),
			])
		"add_node":
			return _sdk_call("scene_ops.gd", "add_node", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("parent_node_path", ""))),
				{
					"name": str(params.get("node_name", "")),
					"type": str(params.get("node_type", "")),
					"properties": params.get("properties", {}),
				},
			])
		"scene_to_json":
			return _sdk_call("scene_ops.gd", "scene_to_json", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"resave_scene":
			return _sdk_call("scene_ops.gd", "resave_scene", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"remove_node":
			return _sdk_call("scene_ops.gd", "remove_node", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
			])
		"update_node":
			return _sdk_call("scene_ops.gd", "update_node", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
				params.get("properties", {}),
			])
		"move_node":
			return _sdk_call("scene_ops.gd", "move_node", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
				_normalize_node_path(str(params.get("new_parent", ""))),
			])
		"get_node_info":
			return _sdk_call("scene_ops.gd", "get_node_info", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
			])
		"list_nodes":
			return _sdk_call("scene_ops.gd", "list_nodes", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"find_nodes_by_type":
			return _sdk_call("scene_ops.gd", "find_nodes_by_type", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				str(params.get("type_name", "")),
			])
		_:
			return null


func _dispatch_script_ops(operation: String, params: Dictionary) -> Variant:
	match operation:
		"create_script":
			return _sdk_call("script_ops.gd", "create_script", [
				_normalize_resource_path(str(params.get("path", ""))),
				str(params.get("content", "")),
				str(params.get("base_type", "")),
			])
		"read_script":
			return _sdk_call("script_ops.gd", "read_script", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"update_script":
			return _sdk_call("script_ops.gd", "update_script", [
				_normalize_resource_path(str(params.get("path", ""))),
				str(params.get("content", "")),
			])
		"delete_script":
			return _sdk_call("script_ops.gd", "delete_script", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"update_script_function":
			return _sdk_call("script_ops.gd", "update_script_function", [
				_normalize_resource_path(str(params.get("path", ""))),
				str(params.get("function_name", "")),
				str(params.get("new_function_content", "")),
			])
		"update_script_range":
			return _sdk_call("script_ops.gd", "update_script_range", [
				_normalize_resource_path(str(params.get("path", ""))),
				int(params.get("start_line", 0)),
				int(params.get("end_line", 0)),
				str(params.get("new_content", "")),
			])
		"attach_script":
			return _sdk_call("script_ops.gd", "attach_script", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
				_normalize_resource_path(str(params.get("script_path", ""))),
			])
		"detach_script":
			return _sdk_call("script_ops.gd", "detach_script", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
			])
		"compile_check":
			return _sdk_call("script_ops.gd", "compile_check", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"get_script_structure":
			return _sdk_call("script_ops.gd", "get_script_structure", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		_:
			return null


func _dispatch_resource_ops(operation: String, params: Dictionary) -> Variant:
	match operation:
		"export_mesh_library":
			return _sdk_call("resource_ops.gd", "export_mesh_library", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_resource_path(str(params.get("output_path", ""))),
				params.get("mesh_item_names", []),
			])
		"bind_resource":
			return _sdk_call("resource_ops.gd", "bind_resource", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
				str(params.get("property", "")),
				_normalize_resource_path(str(params.get("resource_path", ""))),
			])
		"unbind_resource":
			return _sdk_call("resource_ops.gd", "unbind_resource", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
				str(params.get("property", "")),
			])
		"batch_bind":
			return _sdk_call("resource_ops.gd", "batch_bind", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				params.get("bindings", []),
			])
		"get_node_resources":
			return _sdk_call("resource_ops.gd", "get_node_resources", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
				_normalize_node_path(str(params.get("node_path", ""))),
			])
		"get_scene_resources":
			return _sdk_call("resource_ops.gd", "get_scene_resources", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"get_uid":
			return _sdk_call("resource_ops.gd", "get_uid", [
				_normalize_resource_path(str(params.get("file_path", ""))),
			])
		"update_project_uids":
			var update_path := _normalize_project_subpath(str(params.get("directory", params.get("project_path", ""))))
			return _sdk_call("resource_ops.gd", "update_project_uids", [update_path])
		_:
			return null


func _dispatch_validation_ops(operation: String, params: Dictionary) -> Variant:
	match operation:
		"validate_scene":
			return _sdk_call("validation_ops.gd", "validate_scene", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"validate_resources":
			return _sdk_call("validation_ops.gd", "validate_resources", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"validate_script_references":
			return _sdk_call("validation_ops.gd", "validate_script_references", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"validate_all":
			return _sdk_call("validation_ops.gd", "validate_all", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"validate_project":
			return _sdk_call("validation_ops.gd", "validate_project", [
				_normalize_resource_path(str(params.get("path", "res://"))),
			])
		_:
			return null


func _dispatch_project_config_ops(operation: String, params: Dictionary) -> Variant:
	match operation:
		"add_input_action":
			return _sdk_call("project_config.gd", "add_input_action", [
				str(params.get("action_name", "")),
				params.get("events", []),
			])
		"remove_input_action":
			return _sdk_call("project_config.gd", "remove_input_action", [
				str(params.get("action_name", "")),
			])
		"get_input_actions":
			return _sdk_call("project_config.gd", "get_input_actions", [])
		"set_layer_name":
			return _sdk_call("project_config.gd", "set_layer_name", [
				str(params.get("layer_type", "")),
				int(params.get("layer_number", 0)),
				str(params.get("name", "")),
			])
		"get_layer_names":
			return _sdk_call("project_config.gd", "get_layer_names", [
				str(params.get("layer_type", "")),
			])
		"add_autoload":
			return _sdk_call("project_config.gd", "add_autoload", [
				str(params.get("name", "")),
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"remove_autoload":
			return _sdk_call("project_config.gd", "remove_autoload", [
				str(params.get("name", "")),
			])
		"get_autoloads":
			return _sdk_call("project_config.gd", "get_autoloads", [])
		"set_project_setting":
			return _sdk_call("project_config.gd", "set_setting", [
				str(params.get("key", "")),
				params.get("value", null),
			])
		"get_project_setting":
			return _sdk_call("project_config.gd", "get_setting", [
				str(params.get("key", "")),
			])
		_:
			return null


func _dispatch_file_system_ops(operation: String, params: Dictionary) -> Variant:
	match operation:
		"get_directory_tree":
			return _sdk_call("file_system.gd", "get_directory_tree", [
				_normalize_resource_path(str(params.get("path", ""))),
				params.get("options", {}),
			])
		"read_file":
			return _sdk_call("file_system.gd", "read_file", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"write_file":
			return _sdk_call("file_system.gd", "write_file", [
				_normalize_resource_path(str(params.get("path", ""))),
				str(params.get("content", "")),
			])
		"file_exists":
			return _sdk_call("file_system.gd", "file_exists", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"dir_exists":
			return _sdk_call("file_system.gd", "dir_exists", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"list_files":
			return _sdk_call("file_system.gd", "list_files", [
				_normalize_resource_path(str(params.get("path", ""))),
				str(params.get("pattern", "")),
			])
		"get_file_info":
			return _sdk_call("file_system.gd", "get_file_info", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"copy_file":
			return _sdk_call("file_system.gd", "copy_file", [
				_normalize_resource_path(str(params.get("from", ""))),
				_normalize_resource_path(str(params.get("to", ""))),
			])
		"move_file":
			return _sdk_call("file_system.gd", "move_file", [
				_normalize_resource_path(str(params.get("from", ""))),
				_normalize_resource_path(str(params.get("to", ""))),
			])
		"delete_file":
			return _sdk_call("file_system.gd", "delete_file", [
				_normalize_resource_path(str(params.get("path", ""))),
			])
		"grep":
			return _sdk_call("file_system.gd", "grep", [
				str(params.get("pattern", "")),
				_normalize_resource_path(str(params.get("path", ""))),
				params.get("options", {}),
			])
		_:
			return null


func _dispatch_editor_ops(operation: String, params: Dictionary) -> Variant:
	match operation:
		"get_editor_logs":
			return _sdk_call("editor_ops.gd", "get_editor_logs", [params.get("options", {})])
		"get_log_timestamp":
			return _sdk_call("editor_ops.gd", "get_log_timestamp", [])
		"run_scene":
			return _sdk_call("editor_ops.gd", "run_scene", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"stop_scene":
			return _sdk_call("editor_ops.gd", "stop_scene", [])
		"open_scene":
			return _sdk_call("editor_ops.gd", "open_scene", [
				_normalize_resource_path(str(params.get("scene_path", ""))),
			])
		"open_script":
			return _sdk_call("editor_ops.gd", "open_script", [
				_normalize_resource_path(str(params.get("script_path", ""))),
				int(params.get("line", -1)),
			])
		"refresh_filesystem":
			return _sdk_call("editor_ops.gd", "refresh_filesystem", [])
		"get_open_scenes":
			return _sdk_call("editor_ops.gd", "get_open_scenes", [])
		"editor_get_project_info":
			return _sdk_call("editor_ops.gd", "get_project_info", [])
		_:
			return null


func _sdk_call(api_file: String, method_name: String, args: Array) -> Dictionary:
	var script = _load_sdk_script(api_file)
	if script == null:
		return _err("Failed to load SDK API: %s" % api_file, "ERR_SDK_LOAD_FAILED")

	if script.has_method(method_name):
		var result = script.callv(method_name, args)
		if result is Dictionary:
			return result

	var instance = script.new()
	if instance != null and instance.has_method(method_name):
		var result = instance.callv(method_name, args)
		if result is Dictionary:
			return result

	return _err(
		"SDK API method not found or returned invalid result: %s.%s" % [api_file, method_name],
		"ERR_SDK_METHOD_NOT_FOUND"
	)


func _load_sdk_script(api_file: String) -> Variant:
	if _sdk_cache.has(api_file):
		return _sdk_cache[api_file]

	var sdk_root := _resolve_sdk_root()
	if sdk_root.is_empty():
		return null

	var api_path := sdk_root.path_join("api").path_join(api_file).replace("\\", "/")
	if not FileAccess.file_exists(api_path):
		return null

	var script = load(api_path)
	if not (script is Script):
		return null

	_sdk_cache[api_file] = script
	return script


func _resolve_sdk_root() -> String:
	if not _sdk_root_cache.is_empty():
		return _sdk_root_cache

	var script_path := str(get_script().resource_path).replace("\\", "/")
	var script_dir := script_path.get_base_dir()
	var candidates: Array = [
		script_dir.path_join("godot-editor-ops-sdk"),
		script_dir.path_join("../godot-editor-ops-sdk"),
		script_dir.path_join("../../godot-editor-ops-sdk"),
	]

	for raw_candidate in candidates:
		var candidate := str(raw_candidate).replace("\\", "/")
		var sdk_api := candidate.path_join("api/godot_sdk.gd")
		if FileAccess.file_exists(sdk_api):
			_sdk_root_cache = candidate
			_log_debug("Resolved SDK root: %s" % candidate)
			return _sdk_root_cache

	return ""


func _normalize_resource_path(path: String) -> String:
	var result := path.strip_edges().replace("\\", "/")
	if result.is_empty():
		return result
	if result.begins_with("res://") or result.begins_with("user://"):
		return result
	while result.begins_with("/"):
		result = result.substr(1)
	return "res://" + result


func _normalize_project_subpath(path: String) -> String:
	var result := path.strip_edges().replace("\\", "/")
	if result.is_empty():
		return "res://"
	if result.begins_with("res://"):
		return result
	while result.begins_with("/"):
		result = result.substr(1)
	return "res://" + result


func _normalize_node_path(path: String) -> String:
	var result := path.strip_edges()
	if result == "." or result == "root":
		return ""
	if result.begins_with("root/"):
		return result.substr(5)
	return result


func _emit_result(result: Dictionary) -> void:
	print(JSON.stringify(result))


func _ok(data: Dictionary = {}) -> Dictionary:
	return {
		"ok": true,
		"data": data,
	}


func _err(message: String, code: String, data: Dictionary = {}) -> Dictionary:
	return {
		"ok": false,
		"error": message,
		"code": code,
		"data": data,
	}


func _log_debug(message: String) -> void:
	if debug_mode:
		printerr("[DEBUG] %s" % message)
