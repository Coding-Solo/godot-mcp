#!/usr/bin/env -S godot --script
extends SceneTree

var debug_mode := false
var capture_params: Dictionary = {}

func _init():
    var args = OS.get_cmdline_args()

    debug_mode = "--debug-godot" in args

    var script_index = args.find("--script")
    if script_index == -1:
        log_error("Could not find --script argument")
        quit(1)
        return

    var params_index = script_index + 2
    if args.size() <= params_index:
        log_error("Usage: godot --path <project> --script capture_screenshot.gd <json_params>")
        quit(1)
        return

    var params_json = args[params_index]
    var json = JSON.new()
    var error = json.parse(params_json)
    if error != OK:
        log_error("Failed to parse JSON parameters: " + json.get_error_message())
        quit(1)
        return

    var parsed = json.get_data()
    if typeof(parsed) != TYPE_DICTIONARY:
        log_error("Screenshot parameters must be a JSON object")
        quit(1)
        return

    capture_params = parsed
    call_deferred("_capture_screenshot")

func log_debug(message: String):
    if debug_mode:
        print("[DEBUG] " + message)

func log_error(message: String):
    printerr("[ERROR] " + message)

func _contains_traversal(path: String) -> bool:
    for segment in path.replace("\\", "/").split("/"):
        if segment == "..":
            return true
    return false

func _is_absolute_filesystem_path(path: String) -> bool:
    return path.begins_with("/") or path.begins_with("\\") or (path.length() > 1 and path.substr(1, 1) == ":")

func _normalize_relative_path(path: String) -> String:
    var normalized_path = path.strip_edges().replace("\\", "/")
    while normalized_path.begins_with("./"):
        normalized_path = normalized_path.substr(2)
    return normalized_path.trim_prefix("/")

func _build_default_screenshot_name() -> String:
    var datetime = Time.get_datetime_dict_from_system()
    var year = int(datetime.get("year", 0)) % 100
    var month = int(datetime.get("month", 1))
    var day = int(datetime.get("day", 1))
    var hour = int(datetime.get("hour", 0))
    var minute = int(datetime.get("minute", 0))
    var second = int(datetime.get("second", 0))

    return "%02d-%02d-%02d-%02d-%02d-%02d.png" % [year, month, day, hour, minute, second]

func _append_suffix_to_path(path: String, suffix: String) -> String:
    var extension = path.get_extension()
    if extension.is_empty():
        return "%s%s" % [path, suffix]
    return "%s%s.%s" % [path.get_basename(), suffix, extension]

func _ensure_unique_output_path(output_path: String, absolute_path: String) -> Dictionary:
    if not FileAccess.file_exists(absolute_path):
        return {
            "output_path": output_path,
            "absolute_path": absolute_path,
        }

    var counter = 1
    var candidate_output_path = output_path
    var candidate_absolute_path = absolute_path

    while FileAccess.file_exists(candidate_absolute_path):
        var suffix = "-%02d" % counter
        candidate_output_path = _append_suffix_to_path(output_path, suffix)
        candidate_absolute_path = _append_suffix_to_path(absolute_path, suffix)
        counter += 1

    return {
        "output_path": candidate_output_path,
        "absolute_path": candidate_absolute_path,
    }

func _normalize_scene_path(scene_path: String) -> Dictionary:
    var normalized_scene_path = scene_path.strip_edges()

    if normalized_scene_path.is_empty():
        return { "error": "Scene path cannot be empty" }

    if normalized_scene_path.begins_with("user://") or _is_absolute_filesystem_path(normalized_scene_path):
        return { "error": "Scene must be project-relative or start with res://" }

    if _contains_traversal(normalized_scene_path):
        return { "error": "Scene path must not contain traversal segments" }

    if normalized_scene_path.begins_with("res://"):
        normalized_scene_path = _normalize_relative_path(normalized_scene_path.substr(6))
    else:
        normalized_scene_path = _normalize_relative_path(normalized_scene_path)

    if normalized_scene_path.is_empty():
        return { "error": "Scene path cannot be empty" }

    return { "scene_path": "res://" + normalized_scene_path }

func _resolve_output_path(output_path: String) -> Dictionary:
    var normalized_output_path = output_path.strip_edges()

    if normalized_output_path.is_empty():
        normalized_output_path = "user://.godot-mcp-screenshot/%s" % _build_default_screenshot_name()
    elif _is_absolute_filesystem_path(normalized_output_path):
        return { "error": "Absolute filesystem output paths are not allowed" }
    elif normalized_output_path.begins_with("res://") or normalized_output_path.begins_with("user://"):
        var prefix = "res://" if normalized_output_path.begins_with("res://") else "user://"
        normalized_output_path = prefix + _normalize_relative_path(normalized_output_path.substr(prefix.length()))
    else:
        normalized_output_path = "user://" + _normalize_relative_path(normalized_output_path)

    if normalized_output_path.ends_with("res://") or normalized_output_path.ends_with("user://"):
        return { "error": "Output path cannot be empty" }

    if _contains_traversal(normalized_output_path):
        return { "error": "Output path must not contain traversal segments" }

    var absolute_output_path = normalized_output_path
    if normalized_output_path.begins_with("res://") or normalized_output_path.begins_with("user://"):
        absolute_output_path = ProjectSettings.globalize_path(normalized_output_path)

    return _ensure_unique_output_path(normalized_output_path, absolute_output_path)

func _load_target_scene() -> Dictionary:
    var scene_path = ""
    if capture_params.has("scene"):
        var normalized_scene = _normalize_scene_path(str(capture_params.scene))
        if normalized_scene.has("error"):
            return normalized_scene
        scene_path = str(normalized_scene.scene_path)
    else:
        scene_path = str(ProjectSettings.get_setting("application/run/main_scene", ""))

    if scene_path.is_empty():
        return {
            "error": "No target scene provided and the project main scene is not configured",
        }

    if not ResourceLoader.exists(scene_path):
        return {
            "error": "Scene does not exist: " + scene_path,
        }

    var scene_resource = load(scene_path)
    if scene_resource == null:
        return {
            "error": "Failed to load scene: " + scene_path,
        }

    if not scene_resource is PackedScene:
        return {
            "error": "Scene resource is not a PackedScene: " + scene_path,
        }

    return {
        "scene_path": scene_path,
        "scene_resource": scene_resource,
    }

func _capture_screenshot():
    var scene_result = _load_target_scene()
    if scene_result.has("error"):
        log_error(str(scene_result.error))
        quit(1)
        return

    var scene_resource: PackedScene = scene_result.scene_resource
    var scene_instance = scene_resource.instantiate()
    if scene_instance == null:
        log_error("Failed to instantiate scene: " + str(scene_result.scene_path))
        quit(1)
        return

    root.add_child(scene_instance)
    current_scene = scene_instance

    var wait_frames = 2
    if capture_params.has("wait_frames"):
        wait_frames = maxi(1, int(capture_params.wait_frames))

    for _index in range(wait_frames):
        await process_frame

    await RenderingServer.frame_post_draw

    var image = root.get_texture().get_image()
    if image == null:
        log_error("Failed to read viewport image")
        quit(1)
        return

    var output_result = _resolve_output_path(str(capture_params.get("output_path", "")))
    if output_result.has("error"):
        log_error(str(output_result.error))
        quit(1)
        return

    var absolute_output_path = str(output_result.absolute_path)
    var output_dir = absolute_output_path.get_base_dir()
    var directory_error = DirAccess.make_dir_recursive_absolute(output_dir)
    if directory_error != OK:
        log_error("Failed to create screenshot directory: %s (error %s)" % [output_dir, str(directory_error)])
        quit(1)
        return

    var save_error = image.save_png(absolute_output_path)
    if save_error != OK:
        log_error("Failed to save screenshot: %s (error %s)" % [absolute_output_path, str(save_error)])
        quit(1)
        return

    print(JSON.stringify({
        "scene": str(scene_result.scene_path),
        "outputPath": str(output_result.output_path),
        "absolutePath": absolute_output_path,
        "width": image.get_width(),
        "height": image.get_height(),
    }))
    quit()
