#!/usr/bin/env -S godot --headless --script
extends SceneTree

# Debug mode flag
var debug_mode = false

# batch_author state — when active, the authoring ops share ONE loaded scene and defer
# the save, so N ops cost ONE Godot boot instead of N. See batch_author() + _dispatch().
var _batch_active = false
var _batch_root = null
var _batch_abs = ""

func _init():
    var args = OS.get_cmdline_args()
    
    # Check for debug flag
    debug_mode = "--debug-godot" in args
    
    # Find the script argument and determine the positions of operation and params
    var script_index = args.find("--script")
    if script_index == -1:
        log_error("Could not find --script argument")
        quit(1)
    
    # The operation should be 2 positions after the script path (script_index + 1 is the script path itself)
    var operation_index = script_index + 2
    # The params should be 3 positions after the script path
    var params_index = script_index + 3
    
    if args.size() <= params_index:
        log_error("Usage: godot --headless --script godot_operations.gd <operation> <json_params>")
        log_error("Not enough command-line arguments provided.")
        quit(1)
    
    # Log all arguments for debugging
    log_debug("All arguments: " + str(args))
    log_debug("Script index: " + str(script_index))
    log_debug("Operation index: " + str(operation_index))
    log_debug("Params index: " + str(params_index))
    
    var operation = args[operation_index]
    var params_json = args[params_index]
    
    log_info("Operation: " + operation)
    log_debug("Params JSON: " + params_json)
    
    # Parse JSON using Godot 4.x API
    var json = JSON.new()
    var error = json.parse(params_json)
    var params = null
    
    if error == OK:
        params = json.get_data()
    else:
        log_error("Failed to parse JSON parameters: " + params_json)
        log_error("JSON Error: " + json.get_error_message() + " at line " + str(json.get_error_line()))
        quit(1)
        return

    # Resident op-server — checked BEFORE the empty-params guard (its params are legitimately
    # {}). Stays warm and serves ops over TCP so N ops cost ONE Godot boot (no reboot per op).
    # Blocks until the client disconnects / shuts down.
    if operation == "__serve":
        _serve(params if params != null else {})
        quit()
        return

    if not params:
        log_error("Failed to parse JSON parameters: " + params_json)
        quit(1)
        return

    log_info("Executing operation: " + operation)

    _dispatch(operation, params)

    quit()

# Route an operation name to its handler. Factored out of _init so batch_author can
# replay the same handlers against one shared, already-loaded scene.
func _dispatch(operation, params):
    match operation:
        "batch_author":
            batch_author(params)
        "create_scene":
            create_scene(params)
        "add_node":
            add_node(params)
        "load_sprite":
            load_sprite(params)
        "export_mesh_library":
            export_mesh_library(params)
        "save_scene":
            save_scene(params)
        "get_uid":
            get_uid(params)
        "resave_resources":
            resave_resources(params)
        "add_animation":
            add_animation(params)
        "add_collision_shape":
            add_collision_shape(params)
        "set_camera_limits":
            set_camera_limits(params)
        "connect_signal":
            connect_signal(params)
        "add_animated_sprite":
            add_animated_sprite(params)
        "paint_tilemap":
            paint_tilemap(params)
        "add_area2d":
            add_area2d(params)
        "add_particles":
            add_particles(params)
        "attach_script":
            attach_script(params)
        "set_node_property":
            set_node_property(params)
        "remove_node":
            remove_node(params)
        "instance_scene":
            instance_scene(params)
        "get_scene_tree":
            get_scene_tree(params)
        "add_input_action":
            add_input_action(params)
        "set_project_setting":
            set_project_setting(params)
        _:
            log_error("Unknown operation: " + operation)
            quit(1)

# Logging functions
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    print("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)

# Get a script by registered class name.
# Only looks up names via the project's global class registry. Raw paths
# (e.g. "res://evil.gd") are intentionally not accepted here to prevent
# arbitrary script instantiation from agent-supplied input.
func get_script_by_name(name_of_class):
    if debug_mode:
        print("Attempting to get script for class: " + name_of_class)

    # Search for it in the global class registry if it's a class name
    var global_classes = ProjectSettings.get_global_class_list()
    if debug_mode:
        print("Searching through " + str(global_classes.size()) + " global classes")
    
    for global_class in global_classes:
        var found_name_of_class = global_class["class"]
        var found_path = global_class["path"]
        
        if found_name_of_class == name_of_class:
            if debug_mode:
                print("Found matching class in registry: " + found_name_of_class + " at path: " + found_path)
            var script = load(found_path) as Script
            if script:
                if debug_mode:
                    print("Successfully loaded script from registry")
                return script
            else:
                printerr("Failed to load script from registry path: " + found_path)
                break
    
    printerr("Could not find script for class: " + name_of_class)
    return null

# Instantiate a class by name
func instantiate_class(name_of_class):
    if name_of_class.is_empty():
        printerr("Cannot instantiate class: name is empty")
        return null
    
    var result = null
    if debug_mode:
        print("Attempting to instantiate class: " + name_of_class)
    
    # Check if it's a built-in class
    if ClassDB.class_exists(name_of_class):
        if debug_mode:
            print("Class exists in ClassDB, using ClassDB.instantiate()")
        if ClassDB.can_instantiate(name_of_class):
            result = ClassDB.instantiate(name_of_class)
            if result == null:
                printerr("ClassDB.instantiate() returned null for class: " + name_of_class)
        else:
            printerr("Class exists but cannot be instantiated: " + name_of_class)
            printerr("This may be an abstract class or interface that cannot be directly instantiated")
    else:
        # Try to get the script
        if debug_mode:
            print("Class not found in ClassDB, trying to get script")
        var script = get_script_by_name(name_of_class)
        if script is GDScript:
            if debug_mode:
                print("Found GDScript, creating instance")
            result = script.new()
        else:
            printerr("Failed to get script for class: " + name_of_class)
            return null
    
    if result == null:
        printerr("Failed to instantiate class: " + name_of_class)
    elif debug_mode:
        print("Successfully instantiated class: " + name_of_class + " of type: " + result.get_class())
    
    return result

# Create a new scene with a specified root node type
func create_scene(params):
    print("Creating scene: " + params.scene_path)
    
    # Get project paths and log them for debugging
    var project_res_path = "res://"
    var project_user_path = "user://"
    var global_res_path = ProjectSettings.globalize_path(project_res_path)
    var global_user_path = ProjectSettings.globalize_path(project_user_path)
    
    if debug_mode:
        print("Project paths:")
        print("- res:// path: " + project_res_path)
        print("- user:// path: " + project_user_path)
        print("- Globalized res:// path: " + global_res_path)
        print("- Globalized user:// path: " + global_user_path)
        
        # Print some common environment variables for debugging
        print("Environment variables:")
        var env_vars = ["PATH", "HOME", "USER", "TEMP", "GODOT_PATH"]
        for env_var in env_vars:
            if OS.has_environment(env_var):
                print("  " + env_var + " = " + OS.get_environment(env_var))
    
    # Normalize the scene path
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    # Convert resource path to an absolute path
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    # Get the scene directory paths
    var scene_dir_res = full_scene_path.get_base_dir()
    var scene_dir_abs = absolute_scene_path.get_base_dir()
    if debug_mode:
        print("Scene directory (resource path): " + scene_dir_res)
        print("Scene directory (absolute path): " + scene_dir_abs)
    
    # Only do extensive testing in debug mode
    if debug_mode:
        # Try to create a simple test file in the project root to verify write access
        var initial_test_file_path = "res://godot_mcp_test_write.tmp"
        var initial_test_file = FileAccess.open(initial_test_file_path, FileAccess.WRITE)
        if initial_test_file:
            initial_test_file.store_string("Test write access")
            initial_test_file.close()
            print("Successfully wrote test file to project root: " + initial_test_file_path)
            
            # Verify the test file exists
            var initial_test_file_exists = FileAccess.file_exists(initial_test_file_path)
            print("Test file exists check: " + str(initial_test_file_exists))
            
            # Clean up the test file
            if initial_test_file_exists:
                var remove_error = DirAccess.remove_absolute(ProjectSettings.globalize_path(initial_test_file_path))
                print("Test file removal result: " + str(remove_error))
        else:
            var write_error = FileAccess.get_open_error()
            printerr("Failed to write test file to project root: " + str(write_error))
            printerr("This indicates a serious permission issue with the project directory")
    
    # Use traditional if-else statement for better compatibility
    var root_node_type = "Node2D"  # Default value
    if params.has("root_node_type"):
        root_node_type = params.root_node_type
    if debug_mode:
        print("Root node type: " + root_node_type)
    
    # Create the root node
    var scene_root = instantiate_class(root_node_type)
    if not scene_root:
        printerr("Failed to instantiate node of type: " + root_node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    
    scene_root.name = "root"
    if debug_mode:
        print("Root node created with name: " + scene_root.name)
    
    # Set the owner of the root node to itself (important for scene saving)
    scene_root.owner = scene_root
    
    # Pack the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        # Only do extensive testing in debug mode
        if debug_mode:
            # First, let's verify we can write to the project directory
            print("Testing write access to project directory...")
            var test_write_path = "res://test_write_access.tmp"
            var test_write_abs = ProjectSettings.globalize_path(test_write_path)
            var test_file = FileAccess.open(test_write_path, FileAccess.WRITE)
            
            if test_file:
                test_file.store_string("Write test")
                test_file.close()
                print("Successfully wrote test file to project directory")
                
                # Clean up test file
                if FileAccess.file_exists(test_write_path):
                    var remove_error = DirAccess.remove_absolute(test_write_abs)
                    print("Test file removal result: " + str(remove_error))
            else:
                var write_error = FileAccess.get_open_error()
                printerr("Failed to write test file to project directory: " + str(write_error))
                printerr("This may indicate permission issues with the project directory")
                # Continue anyway, as the scene directory might still be writable
        
        # Ensure the scene directory exists using DirAccess
        if debug_mode:
            print("Ensuring scene directory exists...")
        
        # Get the scene directory relative to res://
        var scene_dir_relative = scene_dir_res.substr(6)  # Remove "res://" prefix
        if debug_mode:
            print("Scene directory (relative to res://): " + scene_dir_relative)
        
        # Create the directory if needed
        if not scene_dir_relative.is_empty():
            # First check if it exists
            var dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
            if debug_mode:
                print("Directory exists check (absolute): " + str(dir_exists))
            
            if not dir_exists:
                if debug_mode:
                    print("Directory doesn't exist, creating: " + scene_dir_relative)
                
                # Try to create the directory using DirAccess
                var dir = DirAccess.open("res://")
                if dir == null:
                    var open_error = DirAccess.get_open_error()
                    printerr("Failed to open res:// directory: " + str(open_error))
                    
                    # Try alternative approach with absolute path
                    if debug_mode:
                        print("Trying alternative directory creation approach...")
                    var make_dir_error = DirAccess.make_dir_recursive_absolute(scene_dir_abs)
                    if debug_mode:
                        print("Make directory result (absolute): " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory using absolute path")
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                else:
                    # Create the directory using the DirAccess instance
                    if debug_mode:
                        print("Creating directory using DirAccess: " + scene_dir_relative)
                    var make_dir_error = dir.make_dir_recursive(scene_dir_relative)
                    if debug_mode:
                        print("Make directory result: " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory: " + scene_dir_relative)
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                
                # Verify the directory was created
                dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
                if debug_mode:
                    print("Directory exists check after creation: " + str(dir_exists))
                
                if not dir_exists:
                    printerr("Directory reported as created but does not exist: " + scene_dir_abs)
                    printerr("This may indicate a problem with path resolution or permissions")
                    quit(1)
            elif debug_mode:
                print("Directory already exists: " + scene_dir_abs)
        
        # Save the scene
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        
        if save_error == OK:
            # Only do extensive testing in debug mode
            if debug_mode:
                # Wait a moment to ensure file system has time to complete the write
                print("Waiting for file system to complete write operation...")
                OS.delay_msec(500)  # 500ms delay
                
                # Verify the file was actually created using multiple methods
                var file_check_abs = FileAccess.file_exists(absolute_scene_path)
                print("File exists check (absolute path): " + str(file_check_abs))
                
                var file_check_res = FileAccess.file_exists(full_scene_path)
                print("File exists check (resource path): " + str(file_check_res))
                
                var res_exists = ResourceLoader.exists(full_scene_path)
                print("Resource exists check: " + str(res_exists))
                
                # If file doesn't exist by absolute path, try to create a test file in the same directory
                if not file_check_abs and not file_check_res:
                    printerr("Scene file not found after save. Trying to diagnose the issue...")
                    
                    # Try to write a test file to the same directory
                    var test_scene_file_path = scene_dir_res + "/test_scene_file.tmp"
                    var test_scene_file = FileAccess.open(test_scene_file_path, FileAccess.WRITE)
                    
                    if test_scene_file:
                        test_scene_file.store_string("Test scene directory write")
                        test_scene_file.close()
                        print("Successfully wrote test file to scene directory: " + test_scene_file_path)
                        
                        # Check if the test file exists
                        var test_file_exists = FileAccess.file_exists(test_scene_file_path)
                        print("Test file exists: " + str(test_file_exists))
                        
                        if test_file_exists:
                            # Directory is writable, so the issue is with scene saving
                            printerr("Directory is writable but scene file wasn't created.")
                            printerr("This suggests an issue with ResourceSaver.save() or the packed scene.")
                            
                            # Try saving with a different approach
                            print("Trying alternative save approach...")
                            var alt_save_error = ResourceSaver.save(packed_scene, test_scene_file_path + ".tscn")
                            print("Alternative save result: " + str(alt_save_error))
                            
                            # Clean up test files
                            DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path))
                            if alt_save_error == OK:
                                DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path + ".tscn"))
                        else:
                            printerr("Test file couldn't be verified. This suggests filesystem access issues.")
                    else:
                        var write_error = FileAccess.get_open_error()
                        printerr("Failed to write test file to scene directory: " + str(write_error))
                        printerr("This confirms there are permission or path issues with the scene directory.")
                    
                    # Return error since we couldn't create the scene file
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
                
                # If we get here, at least one of our file checks passed
                if file_check_abs or file_check_res or res_exists:
                    print("Scene file verified to exist!")
                    
                    # Try to load the scene to verify it's valid
                    var test_load = ResourceLoader.load(full_scene_path)
                    if test_load:
                        print("Scene created and verified successfully at: " + params.scene_path)
                        print("Scene file can be loaded correctly.")
                    else:
                        print("Scene file exists but cannot be loaded. It may be corrupted or incomplete.")
                        # Continue anyway since the file exists
                    
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("All file existence checks failed despite successful save operation.")
                    printerr("This indicates a serious issue with file system access or path resolution.")
                    quit(1)
            else:
                # In non-debug mode, just check if the file exists
                var file_exists = FileAccess.file_exists(full_scene_path)
                if file_exists:
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
        else:
            # Handle specific error codes
            var error_message = "Failed to save scene. Error code: " + str(save_error)
            
            if save_error == ERR_CANT_CREATE:
                error_message += " (ERR_CANT_CREATE - Cannot create the scene file)"
            elif save_error == ERR_CANT_OPEN:
                error_message += " (ERR_CANT_OPEN - Cannot open the scene file for writing)"
            elif save_error == ERR_FILE_CANT_WRITE:
                error_message += " (ERR_FILE_CANT_WRITE - Cannot write to the scene file)"
            elif save_error == ERR_FILE_NO_PERMISSION:
                error_message += " (ERR_FILE_NO_PERMISSION - No permission to write the scene file)"
            
            printerr(error_message)
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        printerr("Error code: " + str(result))
        quit(1)

# Add a node to an existing scene
func add_node(params):
    print("Adding node to scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Use traditional if-else statement for better compatibility
    var parent_path = "root"  # Default value
    if params.has("parent_node_path"):
        parent_path = params.parent_node_path
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = scene_root
    if parent_path != "root":
        parent = scene_root.get_node(parent_path.replace("root/", ""))
        if not parent:
            printerr("Parent node not found: " + parent_path)
            quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    if debug_mode:
        print("Instantiating node of type: " + params.node_type)
    var new_node = instantiate_class(params.node_type)
    if not new_node:
        printerr("Failed to instantiate node of type: " + params.node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    new_node.name = params.node_name
    if debug_mode:
        print("New node created with name: " + new_node.name)
    
    if params.has("properties"):
        if debug_mode:
            print("Setting properties on node")
        var properties = params.properties
        for property in properties:
            if debug_mode:
                print("Setting property: " + property + " = " + str(properties[property]))
            var value = properties[property]
            if typeof(value) == TYPE_STRING and value.begins_with("res://"):
                value = load(value)
                if debug_mode:
                    print("Loaded resource for property: " + property + " -> " + str(value))
            new_node.set(property, value)
    
    parent.add_child(new_node)
    new_node.owner = scene_root
    if debug_mode:
        print("Node added to parent and ownership set")
    
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            if debug_mode:
                var file_check_after = FileAccess.file_exists(absolute_scene_path)
                print("File exists check after save: " + str(file_check_after))
                if file_check_after:
                    print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
                else:
                    printerr("File reported as saved but does not exist at: " + absolute_scene_path)
            else:
                print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Load a sprite into a Sprite2D node
func load_sprite(params):
    print("Loading sprite into scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Ensure the texture path starts with res:// for Godot's resource system
    var full_texture_path = params.texture_path
    if not full_texture_path.begins_with("res://"):
        full_texture_path = "res://" + full_texture_path
    
    if debug_mode:
        print("Full texture path (with res://): " + full_texture_path)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Find the sprite node
    var node_path = params.node_path
    if debug_mode:
        print("Original node path: " + node_path)
    
    if node_path.begins_with("root/"):
        node_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Node path after removing 'root/' prefix: " + node_path)
    
    var sprite_node = null
    if node_path == "":
        # If no node path, assume root is the sprite
        sprite_node = scene_root
        if debug_mode:
            print("Using root node as sprite node")
    else:
        sprite_node = scene_root.get_node(node_path)
        if sprite_node and debug_mode:
            print("Found sprite node: " + sprite_node.name)
    
    if not sprite_node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Check if the node is a Sprite2D or compatible type
    if debug_mode:
        print("Node class: " + sprite_node.get_class())
    if not (sprite_node is Sprite2D or sprite_node is Sprite3D or sprite_node is TextureRect):
        printerr("Node is not a sprite-compatible type: " + sprite_node.get_class())
        quit(1)
    
    # Load the texture
    if debug_mode:
        print("Loading texture from: " + full_texture_path)
    var texture = load(full_texture_path)
    if not texture:
        printerr("Failed to load texture: " + full_texture_path)
        quit(1)
    
    if debug_mode:
        print("Texture loaded successfully")
    
    # Set the texture on the sprite
    if sprite_node is Sprite2D or sprite_node is Sprite3D:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on Sprite2D/Sprite3D node")
    elif sprite_node is TextureRect:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on TextureRect node")
    
    # Save the modified scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_scene_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Sprite loaded successfully with texture: " + full_texture_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_scene_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_scene_path)
            else:
                print("Sprite loaded successfully with texture: " + full_texture_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Export a scene as a MeshLibrary resource
func export_mesh_library(params):
    print("Exporting MeshLibrary from scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Ensure the output path starts with res:// for Godot's resource system
    var full_output_path = params.output_path
    if not full_output_path.begins_with("res://"):
        full_output_path = "res://" + full_output_path
    
    if debug_mode:
        print("Full output path (with res://): " + full_output_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    if debug_mode:
        print("Loading scene from: " + full_scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Create a new MeshLibrary
    var mesh_library = MeshLibrary.new()
    if debug_mode:
        print("Created new MeshLibrary")
    
    # Get mesh item names if provided
    var mesh_item_names = params.mesh_item_names if params.has("mesh_item_names") else []
    var use_specific_items = mesh_item_names.size() > 0
    
    if debug_mode:
        if use_specific_items:
            print("Using specific mesh items: " + str(mesh_item_names))
        else:
            print("Using all mesh items in the scene")
    
    # Process all child nodes
    var item_id = 0
    if debug_mode:
        print("Processing child nodes...")
    
    for child in scene_root.get_children():
        if debug_mode:
            print("Checking child node: " + child.name)
        
        # Skip if not using all items and this item is not in the list
        if use_specific_items and not (child.name in mesh_item_names):
            if debug_mode:
                print("Skipping node " + child.name + " (not in specified items list)")
            continue
            
        # Check if the child has a mesh
        var mesh_instance = null
        if child is MeshInstance3D:
            mesh_instance = child
            if debug_mode:
                print("Node " + child.name + " is a MeshInstance3D")
        else:
            # Try to find a MeshInstance3D in the child's descendants
            if debug_mode:
                print("Searching for MeshInstance3D in descendants of " + child.name)
            for descendant in child.get_children():
                if descendant is MeshInstance3D:
                    mesh_instance = descendant
                    if debug_mode:
                        print("Found MeshInstance3D in descendant: " + descendant.name)
                    break
        
        if mesh_instance and mesh_instance.mesh:
            if debug_mode:
                print("Adding mesh: " + child.name)
            
            # Add the mesh to the library
            mesh_library.create_item(item_id)
            mesh_library.set_item_name(item_id, child.name)
            mesh_library.set_item_mesh(item_id, mesh_instance.mesh)
            if debug_mode:
                print("Added mesh to library with ID: " + str(item_id))
            
            # Add collision shape if available
            var collision_added = false
            for collision_child in child.get_children():
                if collision_child is CollisionShape3D and collision_child.shape:
                    mesh_library.set_item_shapes(item_id, [collision_child.shape])
                    if debug_mode:
                        print("Added collision shape from: " + collision_child.name)
                    collision_added = true
                    break
            
            if debug_mode and not collision_added:
                print("No collision shape found for mesh: " + child.name)
            
            # Add preview if available
            if mesh_instance.mesh:
                mesh_library.set_item_preview(item_id, mesh_instance.mesh)
                if debug_mode:
                    print("Added preview for mesh: " + child.name)
            
            item_id += 1
        elif debug_mode:
            print("Node " + child.name + " has no valid mesh")
    
    if debug_mode:
        print("Processed " + str(item_id) + " meshes")
    
    # Create directory if it doesn't exist
    var dir = DirAccess.open("res://")
    if dir == null:
        printerr("Failed to open res:// directory")
        printerr("DirAccess error: " + str(DirAccess.get_open_error()))
        quit(1)
        
    var output_dir = full_output_path.get_base_dir()
    if debug_mode:
        print("Output directory: " + output_dir)
    
    if output_dir != "res://" and not dir.dir_exists(output_dir.substr(6)):  # Remove "res://" prefix
        if debug_mode:
            print("Creating directory: " + output_dir)
        var error = dir.make_dir_recursive(output_dir.substr(6))  # Remove "res://" prefix
        if error != OK:
            printerr("Failed to create directory: " + output_dir + ", error: " + str(error))
            quit(1)
    
    # Save the mesh library
    if item_id > 0:
        if debug_mode:
            print("Saving MeshLibrary to: " + full_output_path)
        var error = ResourceSaver.save(mesh_library, full_output_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_output_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_output_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_output_path)
            else:
                print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
        else:
            printerr("Failed to save MeshLibrary: " + str(error))
    else:
        printerr("No valid meshes found in the scene")

# Find files with a specific extension recursively
func find_files(path, extension):
    var files = []
    var dir = DirAccess.open(path)
    
    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()
        
        while file_name != "":
            if dir.current_is_dir() and not file_name.begins_with("."):
                files.append_array(find_files(path + file_name + "/", extension))
            elif file_name.ends_with(extension):
                files.append(path + file_name)
            
            file_name = dir.get_next()
    
    return files

# Get UID for a specific file
func get_uid(params):
    if not params.has("file_path"):
        printerr("File path is required")
        quit(1)
    
    # Ensure the file path starts with res:// for Godot's resource system
    var file_path = params.file_path
    if not file_path.begins_with("res://"):
        file_path = "res://" + file_path
    
    print("Getting UID for file: " + file_path)
    if debug_mode:
        print("Full file path (with res://): " + file_path)
    
    # Get the absolute path for reference
    var absolute_path = ProjectSettings.globalize_path(file_path)
    if debug_mode:
        print("Absolute file path: " + absolute_path)
    
    # Ensure the file exists
    var file_check = FileAccess.file_exists(file_path)
    if debug_mode:
        print("File exists check: " + str(file_check))
    
    if not file_check:
        printerr("File does not exist at: " + file_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Check if the UID file exists
    var uid_path = file_path + ".uid"
    if debug_mode:
        print("UID file path: " + uid_path)
    
    var uid_check = FileAccess.file_exists(uid_path)
    if debug_mode:
        print("UID file exists check: " + str(uid_check))
    
    var f = FileAccess.open(uid_path, FileAccess.READ)
    
    if f:
        # Read the UID content
        var uid_content = f.get_as_text()
        f.close()
        if debug_mode:
            print("UID content read successfully")
        
        # Return the UID content
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "uid": uid_content.strip_edges(),
            "exists": true
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))
    else:
        if debug_mode:
            print("UID file does not exist or could not be opened")
        
        # UID file doesn't exist
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "exists": false,
            "message": "UID file does not exist for this file. Use resave_resources to generate UIDs."
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))

# Resave all resources to update UID references
func resave_resources(params):
    print("Resaving all resources to update UID references...")
    
    # Get project path if provided
    var project_path = "res://"
    if params.has("project_path"):
        project_path = params.project_path
        if not project_path.begins_with("res://"):
            project_path = "res://" + project_path
        if not project_path.ends_with("/"):
            project_path += "/"
    
    if debug_mode:
        print("Using project path: " + project_path)
    
    # Get all .tscn files
    if debug_mode:
        print("Searching for scene files in: " + project_path)
    var scenes = find_files(project_path, ".tscn")
    if debug_mode:
        print("Found " + str(scenes.size()) + " scenes")
    
    # Resave each scene
    var success_count = 0
    var error_count = 0
    
    for scene_path in scenes:
        if debug_mode:
            print("Processing scene: " + scene_path)
        
        # Check if the scene file exists
        var file_check = FileAccess.file_exists(scene_path)
        if debug_mode:
            print("Scene file exists check: " + str(file_check))
        
        if not file_check:
            printerr("Scene file does not exist at: " + scene_path)
            error_count += 1
            continue
        
        # Load the scene
        var scene = load(scene_path)
        if scene:
            if debug_mode:
                print("Scene loaded successfully, saving...")
            var error = ResourceSaver.save(scene, scene_path)
            if debug_mode:
                print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
            
            if error == OK:
                success_count += 1
                if debug_mode:
                    print("Scene saved successfully: " + scene_path)
                
                    # Verify the file was actually updated
                    var file_check_after = FileAccess.file_exists(scene_path)
                    print("File exists check after save: " + str(file_check_after))
                
                    if not file_check_after:
                        printerr("File reported as saved but does not exist at: " + scene_path)
            else:
                error_count += 1
                printerr("Failed to save: " + scene_path + ", error: " + str(error))
        else:
            error_count += 1
            printerr("Failed to load: " + scene_path)
    
    # Get all .gd and .shader files
    if debug_mode:
        print("Searching for script and shader files in: " + project_path)
    var scripts = find_files(project_path, ".gd") + find_files(project_path, ".shader") + find_files(project_path, ".gdshader")
    if debug_mode:
        print("Found " + str(scripts.size()) + " scripts/shaders")
    
    # Check for missing .uid files
    var missing_uids = 0
    var generated_uids = 0
    
    for script_path in scripts:
        if debug_mode:
            print("Checking UID for: " + script_path)
        var uid_path = script_path + ".uid"
        
        var uid_check = FileAccess.file_exists(uid_path)
        if debug_mode:
            print("UID file exists check: " + str(uid_check))
        
        var f = FileAccess.open(uid_path, FileAccess.READ)
        if not f:
            missing_uids += 1
            if debug_mode:
                print("Missing UID file for: " + script_path + ", generating...")
            
            # Force a save to generate UID
            var res = load(script_path)
            if res:
                var error = ResourceSaver.save(res, script_path)
                if debug_mode:
                    print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
                
                if error == OK:
                    generated_uids += 1
                    if debug_mode:
                        print("Generated UID for: " + script_path)
                    
                        # Verify the UID file was actually created
                        var uid_check_after = FileAccess.file_exists(uid_path)
                        print("UID file exists check after save: " + str(uid_check_after))
                    
                        if not uid_check_after:
                            printerr("UID file reported as generated but does not exist at: " + uid_path)
                else:
                    printerr("Failed to generate UID for: " + script_path + ", error: " + str(error))
            else:
                printerr("Failed to load resource: " + script_path)
        elif debug_mode:
            print("UID file already exists for: " + script_path)
    
    if debug_mode:
        print("Summary:")
        print("- Scenes processed: " + str(scenes.size()))
        print("- Scenes successfully saved: " + str(success_count))
        print("- Scenes with errors: " + str(error_count))
        print("- Scripts/shaders missing UIDs: " + str(missing_uids))
        print("- UIDs successfully generated: " + str(generated_uids))
    print("Resave operation complete")

# Save changes to a scene file
func save_scene(params):
    print("Saving scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Determine save path
    var save_path = params.new_path if params.has("new_path") else full_scene_path
    if params.has("new_path") and not save_path.begins_with("res://"):
        save_path = "res://" + save_path
    
    if debug_mode:
        print("Save path: " + save_path)
    
    # Create directory if it doesn't exist
    if params.has("new_path"):
        var dir = DirAccess.open("res://")
        if dir == null:
            printerr("Failed to open res:// directory")
            printerr("DirAccess error: " + str(DirAccess.get_open_error()))
            quit(1)
            
        var scene_dir = save_path.get_base_dir()
        if debug_mode:
            print("Scene directory: " + scene_dir)
        
        if scene_dir != "res://" and not dir.dir_exists(scene_dir.substr(6)):  # Remove "res://" prefix
            if debug_mode:
                print("Creating directory: " + scene_dir)
            var error = dir.make_dir_recursive(scene_dir.substr(6))  # Remove "res://" prefix
            if error != OK:
                printerr("Failed to create directory: " + scene_dir + ", error: " + str(error))
                quit(1)
    
    # Create a packed scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + save_path)
        var error = ResourceSaver.save(packed_scene, save_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created/updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(save_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Scene saved successfully to: " + save_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(save_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + save_path)
            else:
                print("Scene saved successfully to: " + save_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))

# ─────────────────────────────────────────────────────────────────────────────
# AUTHORING LAYER (Studio Leon) — drive Godot's real node systems headlessly, so
# agents stop hand-rolling movement/animation on a bare canvas. Each op: load the
# scene -> modify via the engine's own APIs -> pack -> save.
# ─────────────────────────────────────────────────────────────────────────────

# Apply an ORDERED list of authoring ops against ONE scene loaded ONCE, saving ONCE at the
# end — so a scene authored with K ops costs a single Godot boot, not K. On any op's internal
# failure the op quits the process before the final save, so the .tscn on disk is left
# unchanged (no partial writes). params: { scene_path, ops:[{op, ...opParams}] }.
func batch_author(params):
    if not params.has("scene_path"):
        printerr("batch_author requires scene_path")
        quit(1)
        return
    var full = str(params.scene_path)
    if not full.begins_with("res://"):
        full = "res://" + full
    var abs_path = ProjectSettings.globalize_path(full)
    if not FileAccess.file_exists(abs_path):
        printerr("Scene file does not exist at: " + abs_path)
        quit(1)
        return
    var scene = load(full)
    if not scene:
        printerr("Failed to load scene: " + full)
        quit(1)
        return
    var ops = params.get("ops", [])
    if not (ops is Array) or ops.size() == 0:
        printerr("batch_author requires a non-empty 'ops' array")
        quit(1)
        return

    _batch_root = scene.instantiate()
    _batch_abs = abs_path
    _batch_active = true

    var applied = 0
    for i in range(ops.size()):
        var raw = ops[i]
        if not (raw is Dictionary) or not raw.has("op"):
            _batch_active = false
            printerr("batch_author: op #" + str(i) + " must be an object with an 'op' field")
            quit(1)
            return
        # The TS camel->snake converter doesn't recurse into arrays, so batched op entries
        # arrive camelCase — normalize each entry's keys here so the handlers find them.
        var entry = _snakeify(raw)
        var op_name = str(entry.op)
        if op_name == "batch_author":
            _batch_active = false
            printerr("batch_author cannot be nested")
            quit(1)
            return
        log_info("[batch] op " + str(i + 1) + "/" + str(ops.size()) + ": " + op_name)
        # A failing handler calls quit() itself -> process ends before the save below,
        # leaving the scene file untouched.
        _dispatch(op_name, entry)
        applied += 1

    # All ops applied against the in-memory tree — pack + save exactly once.
    _batch_active = false
    var packed = PackedScene.new()
    var result = packed.pack(_batch_root)
    if result != OK:
        printerr("batch_author: failed to pack scene: " + str(result))
        quit(1)
        return
    var err = ResourceSaver.save(packed, _batch_abs)
    if err != OK:
        printerr("batch_author: failed to save scene: " + str(err))
        quit(1)
        return
    print("batch_author applied " + str(applied) + " op(s) to " + str(params.scene_path))

# Recursively convert Dictionary keys from camelCase to snake_case (and descend into
# nested arrays/dicts), so batched op params match what the handlers read.
func _snakeify(v):
    if v is Dictionary:
        var out = {}
        for k in v.keys():
            out[_to_snake(str(k))] = _snakeify(v[k])
        return out
    elif v is Array:
        var arr = []
        for e in v:
            arr.append(_snakeify(e))
        return arr
    return v

func _to_snake(s):
    var r = ""
    for i in range(s.length()):
        var c = s[i]
        if c >= "A" and c <= "Z":
            if i > 0:
                r += "_"
            r += c.to_lower()
        else:
            r += c
    return r

# Resident op-server. Opens a TCP listener on an ephemeral port, prints it (so the MCP
# server can connect), then serves newline-delimited JSON requests { id, op, params } ->
# { id, ok, result|error } by replaying the SAME _dispatch handlers — no reboot per op.
# One request at a time (the TS side serializes). A handler that hits a hard error still
# quit()s the process; the TS side detects the exit and restarts the resident.
func _serve(params):
    var server = TCPServer.new()
    var err = server.listen(0)
    if err != OK:
        printerr("op-server: listen failed: " + str(err))
        return
    var port = server.get_local_port()
    # This exact marker is how the MCP server learns the port. Keep it stable.
    print("LEON_OP_SERVER_PORT " + str(port))

    # Wait (bounded) for the MCP server to connect.
    var peer = null
    var waited = 0
    while peer == null:
        if server.is_connection_available():
            peer = server.take_connection()
        else:
            OS.delay_msec(5)
            waited += 5
            if waited > 30000:
                printerr("op-server: no client connected within 30s")
                server.stop()
                return
    peer.set_no_delay(true)
    print("LEON_OP_SERVER_READY")

    var buf = ""
    while true:
        peer.poll()
        if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
            break
        var avail = peer.get_available_bytes()
        if avail > 0:
            buf += peer.get_utf8_string(avail)
            while buf.find("\n") != -1:
                var idx = buf.find("\n")
                var line = buf.substr(0, idx)
                buf = buf.substr(idx + 1)
                if line.strip_edges() != "":
                    _handle_request(peer, line)
        else:
            OS.delay_msec(3)
    server.stop()

func _handle_request(peer, line):
    var json = JSON.new()
    if json.parse(line) != OK:
        _reply(peer, {"id": null, "ok": false, "error": "bad json"})
        return
    var req = json.get_data()
    if not (req is Dictionary):
        _reply(peer, {"id": null, "ok": false, "error": "request must be an object"})
        return
    var id = req.get("id", null)
    var op = str(req.get("op", ""))
    if op == "__ping":
        _reply(peer, {"id": id, "ok": true, "result": "pong"})
        return
    if op == "__shutdown":
        _reply(peer, {"id": id, "ok": true, "result": "bye"})
        _reply_flush(peer)
        quit()
        return
    if op == "__serve" or op == "":
        _reply(peer, {"id": id, "ok": false, "error": "invalid op"})
        return
    var op_params = _snakeify(req.get("params", {}))
    # A failing handler prints the error + quit()s the process; the client then sees the
    # socket close and treats this request as failed. On success it prints to stdout and
    # we ack over TCP (mutating ops persist their own .tscn via _authoring_save).
    _dispatch(op, op_params)
    _reply(peer, {"id": id, "ok": true})

func _reply(peer, obj):
    var data = (JSON.stringify(obj) + "\n").to_utf8_buffer()
    peer.put_data(data)

func _reply_flush(peer):
    # best-effort: make sure the reply bytes go out before we quit
    peer.poll()

func _authoring_load(params):
    # In a batch, every op shares the ONE scene loaded by batch_author — don't reload.
    if _batch_active:
        return {"root": _batch_root, "abs": _batch_abs}
    var full = params.scene_path
    if not full.begins_with("res://"):
        full = "res://" + full
    var abs_path = ProjectSettings.globalize_path(full)
    if not FileAccess.file_exists(abs_path):
        printerr("Scene file does not exist at: " + abs_path)
        quit(1)
        return null
    var scene = load(full)
    if not scene:
        printerr("Failed to load scene: " + full)
        quit(1)
        return null
    return {"root": scene.instantiate(), "abs": abs_path}

func _authoring_find(root, path):
    if path == null or path == "" or path == "root":
        return root
    var p = str(path).replace("root/", "")
    var n = root.get_node_or_null(p)
    if n == null:
        printerr("Node not found: " + str(path))
    return n

func _authoring_save(root, abs_path, msg):
    # In a batch, defer the real save — batch_author packs + saves ONCE at the end, so a
    # mid-batch failure (which quits) leaves the .tscn on disk untouched. Just log progress.
    if _batch_active:
        print("[batch] " + msg)
        return
    var packed = PackedScene.new()
    var result = packed.pack(root)
    if result != OK:
        printerr("Failed to pack scene: " + str(result))
        quit(1)
        return
    var err = ResourceSaver.save(packed, abs_path)
    if err != OK:
        printerr("Failed to save scene: " + str(err))
        quit(1)
        return
    print(msg)

# Add an AnimationPlayer (if needed) + a value-track Animation built from keys.
# params: scene_path, animation_name, player_parent?, player_path?, length?, loop?,
#   tracks:[{path:"NodeName:property", keys:[{time,value}], interp?:"nearest"}]
func add_animation(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var player = null
    if params.has("player_path"):
        player = _authoring_find(root, params.player_path)
    var player_parent = _authoring_find(root, params.get("player_parent", "root"))
    if player_parent == null:
        quit(1)
        return
    if player == null:
        player = player_parent.get_node_or_null("AnimationPlayer")
    if player == null:
        player = AnimationPlayer.new()
        player.name = "AnimationPlayer"
        player_parent.add_child(player)
        player.owner = root
    var anim = Animation.new()
    anim.length = float(params.get("length", 1.0))
    if bool(params.get("loop", true)):
        anim.loop_mode = Animation.LOOP_LINEAR
    else:
        anim.loop_mode = Animation.LOOP_NONE
    for track in params.get("tracks", []):
        var ti = anim.add_track(Animation.TYPE_VALUE)
        anim.track_set_path(ti, NodePath(track.path))
        if track.get("interp", "") == "nearest":
            anim.track_set_interpolation_type(ti, Animation.INTERPOLATION_NEAREST)
        for key in track.get("keys", []):
            anim.track_insert_key(ti, float(key.time), key.value)
    var lib
    if player.has_animation_library(""):
        lib = player.get_animation_library("")
    else:
        lib = AnimationLibrary.new()
        player.add_animation_library("", lib)
    var an = params.get("animation_name", "anim")
    if lib.has_animation(an):
        lib.remove_animation(an)
    lib.add_animation(an, anim)
    _authoring_save(root, ctx.abs, "Animation '" + str(an) + "' added to " + str(player.name))

# Add a CollisionShape2D with a real shape to a body — fixes floating / no-collision.
# params: scene_path, parent_path (the body), shape:"rectangle"|"circle"|"capsule",
#   size:[w,h] | radius | height, position?:[x,y], name?
func add_collision_shape(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var parent = _authoring_find(root, params.get("parent_path", "root"))
    if parent == null:
        quit(1)
        return
    var cs = CollisionShape2D.new()
    cs.name = params.get("name", "CollisionShape2D")
    var kind = params.get("shape", "rectangle")
    var shape
    if kind == "circle":
        shape = CircleShape2D.new()
        shape.radius = float(params.get("radius", 16))
    elif kind == "capsule":
        shape = CapsuleShape2D.new()
        shape.radius = float(params.get("radius", 12))
        shape.height = float(params.get("height", 40))
    else:
        shape = RectangleShape2D.new()
        shape.size = _to_size(params.get("size", null))
    cs.shape = shape
    if params.has("position"):
        var pos = params.position
        cs.position = Vector2(float(pos[0]), float(pos[1]))
    parent.add_child(cs)
    cs.owner = root
    _authoring_save(root, ctx.abs, "CollisionShape2D (" + str(kind) + ") added to " + str(parent.name))

# Set Camera2D limits (clamp to the map), creating the camera if needed.
# params: scene_path, camera_path? | camera_parent?, limits:{left,top,right,bottom}, smoothing?
func set_camera_limits(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var cam = null
    if params.has("camera_path"):
        cam = _authoring_find(root, params.camera_path)
    if cam == null:
        var parent = _authoring_find(root, params.get("camera_parent", "root"))
        if parent == null:
            quit(1)
            return
        cam = parent.get_node_or_null("Camera2D")
        if cam == null:
            cam = Camera2D.new()
            cam.name = "Camera2D"
            parent.add_child(cam)
            cam.owner = root
    var lim = params.get("limits", {})
    if lim.has("left"):
        cam.limit_left = int(lim.left)
    if lim.has("top"):
        cam.limit_top = int(lim.top)
    if lim.has("right"):
        cam.limit_right = int(lim.right)
    if lim.has("bottom"):
        cam.limit_bottom = int(lim.bottom)
    if params.has("smoothing"):
        cam.position_smoothing_enabled = true
        cam.position_smoothing_speed = float(params.smoothing)
    _authoring_save(root, ctx.abs, "Camera2D limits set on " + str(cam.name))

# Persistently connect a signal (serialized into the scene) — wire, don't hand-poll.
# params: scene_path, from_path, signal, to_path, method
func connect_signal(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var from_node = _authoring_find(root, params.from_path)
    var to_node = _authoring_find(root, params.to_path)
    if from_node == null or to_node == null:
        quit(1)
        return
    var sig = params["signal"]
    if not from_node.has_signal(sig):
        printerr("Node has no signal: " + str(sig))
        quit(1)
        return
    var err = from_node.connect(sig, Callable(to_node, params.method), CONNECT_PERSIST)
    if err != OK:
        printerr("Failed to connect signal: " + str(err))
        quit(1)
        return
    _authoring_save(root, ctx.abs, "Connected " + str(from_node.name) + "." + str(sig) + " -> " + str(to_node.name) + "." + str(params.method))

# ── AUTHORING LAYER batch 2 — animated sprites, tilemaps, areas, particles ──────

# Robustly read a 2D size from agent-supplied params. Callers pass it as a dict {x,y}
# (or {w,h}), an array [w,h], a single number (square), or omit it (default). The old code
# assumed an array and crashed on the dict form ("Invalid access to key '0'").
func _to_size(v, def_w := 32.0, def_h := 32.0) -> Vector2:
    if v is Dictionary:
        return Vector2(float(v.get("x", v.get("w", def_w))), float(v.get("y", v.get("h", def_h))))
    if v is Array:
        if v.size() >= 2:
            return Vector2(float(v[0]), float(v[1]))
        if v.size() == 1:
            return Vector2(float(v[0]), float(v[0]))
    if v is float or v is int:
        return Vector2(float(v), float(v))
    return Vector2(def_w, def_h)

func _make_shape(params):
    var kind = params.get("shape", "rectangle")
    var shape
    if kind == "circle":
        shape = CircleShape2D.new()
        shape.radius = float(params.get("radius", 16))
    elif kind == "capsule":
        shape = CapsuleShape2D.new()
        shape.radius = float(params.get("radius", 12))
        shape.height = float(params.get("height", 40))
    else:
        shape = RectangleShape2D.new()
        shape.size = _to_size(params.get("size", null))
    return shape

# AnimatedSprite2D + SpriteFrames built from a sprite sheet (grid of frames).
# params: scene_path, parent_path, name?, texture (res:// sheet), frame_width, frame_height,
#   animations:[{name, frames:[frame_index,...], fps?, loop?}], autoplay?
func add_animated_sprite(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var parent = _authoring_find(root, params.get("parent_path", "root"))
    if parent == null:
        quit(1)
        return
    var tex = load(params.texture)
    if tex == null:
        printerr("Texture not found: " + str(params.texture))
        quit(1)
        return
    var fw = int(params.get("frame_width", 16))
    var fh = int(params.get("frame_height", 16))
    var cols = int(tex.get_width() / fw)
    if cols < 1:
        cols = 1
    var sf = SpriteFrames.new()
    if sf.has_animation("default"):
        sf.remove_animation("default")
    for a in params.get("animations", []):
        var aname = a.name
        if not sf.has_animation(aname):
            sf.add_animation(aname)
        sf.set_animation_speed(aname, float(a.get("fps", 8)))
        sf.set_animation_loop(aname, bool(a.get("loop", true)))
        for idx in a.get("frames", []):
            var at = AtlasTexture.new()
            at.atlas = tex
            var fx = (int(idx) % cols) * fw
            var fy = int(int(idx) / cols) * fh
            at.region = Rect2(fx, fy, fw, fh)
            sf.add_frame(aname, at)
    var spr = AnimatedSprite2D.new()
    spr.name = params.get("name", "AnimatedSprite2D")
    spr.sprite_frames = sf
    if params.has("autoplay"):
        spr.autoplay = params.autoplay
    parent.add_child(spr)
    spr.owner = root
    _authoring_save(root, ctx.abs, "AnimatedSprite2D added to " + str(parent.name))

# A TileMapLayer with a TileSet built from an atlas texture, then painted cells.
# params: scene_path, parent_path, name?, texture (res:// atlas), tile_size,
#   cells:[{x,y,atlas_x,atlas_y}]
func paint_tilemap(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var parent = _authoring_find(root, params.get("parent_path", "root"))
    if parent == null:
        quit(1)
        return
    var tex = load(params.texture)
    if tex == null:
        printerr("Texture not found: " + str(params.texture))
        quit(1)
        return
    var tile = int(params.get("tile_size", 16))
    var ts = TileSet.new()
    ts.tile_size = Vector2i(tile, tile)
    var src = TileSetAtlasSource.new()
    src.texture = tex
    src.texture_region_size = Vector2i(tile, tile)
    var cols = int(tex.get_width() / tile)
    var rows = int(tex.get_height() / tile)
    for ty in rows:
        for tx in cols:
            src.create_tile(Vector2i(tx, ty))
    var src_id = ts.add_source(src)
    var layer = TileMapLayer.new()
    layer.name = params.get("name", "TileMapLayer")
    layer.tile_set = ts
    for cell in params.get("cells", []):
        # tolerate both snake_case and camelCase for the atlas coords (array items
        # aren't key-converted by the MCP layer)
        var ax = cell.get("atlas_x", cell.get("atlasX", 0))
        var ay = cell.get("atlas_y", cell.get("atlasY", 0))
        layer.set_cell(Vector2i(int(cell.x), int(cell.y)), src_id, Vector2i(int(ax), int(ay)))
    parent.add_child(layer)
    layer.owner = root
    _authoring_save(root, ctx.abs, "TileMapLayer painted (" + str(params.get("cells", []).size()) + " cells)")

# An Area2D + CollisionShape2D — hitboxes/hurtboxes/triggers/pickups.
# params: scene_path, parent_path, name?, shape/size/radius/height, position?,
#   collision_layer?, collision_mask?
func add_area2d(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var parent = _authoring_find(root, params.get("parent_path", "root"))
    if parent == null:
        quit(1)
        return
    var area = Area2D.new()
    area.name = params.get("name", "Area2D")
    if params.has("collision_layer"):
        area.collision_layer = int(params.collision_layer)
    if params.has("collision_mask"):
        area.collision_mask = int(params.collision_mask)
    var cs = CollisionShape2D.new()
    cs.shape = _make_shape(params)
    if params.has("position"):
        var pos = params.position
        cs.position = Vector2(float(pos[0]), float(pos[1]))
    parent.add_child(area)
    area.owner = root
    area.add_child(cs)
    cs.owner = root
    _authoring_save(root, ctx.abs, "Area2D added to " + str(parent.name))

# GPUParticles2D + ParticleProcessMaterial — cheap juice (bursts, trails, dust).
# params: scene_path, parent_path, name?, amount?, lifetime?, texture?, gravity?,
#   spread?, velocity?, one_shot?, explosiveness?
func add_particles(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var parent = _authoring_find(root, params.get("parent_path", "root"))
    if parent == null:
        quit(1)
        return
    var p = GPUParticles2D.new()
    p.name = params.get("name", "GPUParticles2D")
    p.amount = int(params.get("amount", 16))
    p.lifetime = float(params.get("lifetime", 1.0))
    if params.has("one_shot"):
        p.one_shot = bool(params.one_shot)
    if params.has("explosiveness"):
        p.explosiveness = float(params.explosiveness)
    if params.has("texture"):
        var tex = load(params.texture)
        if tex != null:
            p.texture = tex
    var mat = ParticleProcessMaterial.new()
    mat.gravity = Vector3(0, float(params.get("gravity", 98)), 0)
    if params.has("spread"):
        mat.spread = float(params.spread)
    if params.has("velocity"):
        mat.initial_velocity_min = float(params.velocity)
        mat.initial_velocity_max = float(params.velocity)
    p.process_material = mat
    parent.add_child(p)
    p.owner = root
    _authoring_save(root, ctx.abs, "GPUParticles2D added to " + str(parent.name))

# ── AUTHORING LAYER batch 3 — behavior, input, project config, composition, edit ─

# Attach an existing GDScript (write the .gd first) to a node in the scene.
# params: scene_path, node_path, script_path (res://...)
func attach_script(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var node = _authoring_find(root, params.node_path)
    if node == null:
        quit(1)
        return
    var sp = params.script_path
    if not sp.begins_with("res://"):
        sp = "res://" + sp
    var scr = load(sp)
    if scr == null:
        printerr("Script not found: " + str(sp))
        quit(1)
        return
    node.set_script(scr)
    _authoring_save(root, ctx.abs, "Script " + str(sp) + " attached to " + str(node.name))

# Set properties on an EXISTING node (add_node sets them at creation; use this to tweak).
# params: scene_path, node_path, properties:{...}   (res:// values are loaded)
func set_node_property(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var node = _authoring_find(root, params.node_path)
    if node == null:
        quit(1)
        return
    for property in params.get("properties", {}):
        var value = params.properties[property]
        if typeof(value) == TYPE_STRING and value.begins_with("res://"):
            value = load(value)
        node.set(property, value)
    _authoring_save(root, ctx.abs, "Properties set on " + str(node.name))

# Remove a node from the scene.
# params: scene_path, node_path
func remove_node(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var node = _authoring_find(root, params.node_path)
    if node == null:
        quit(1)
        return
    if node == root:
        printerr("Cannot remove the scene root")
        quit(1)
        return
    var parent = node.get_parent()
    parent.remove_child(node)
    node.free()
    _authoring_save(root, ctx.abs, "Removed node " + str(params.node_path))

# Instance a sub-scene (a PackedScene / prefab) as a child — the Godot way to compose.
# params: scene_path, sub_scene (res:// .tscn), parent_path?, name?, position?:[x,y]
func instance_scene(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    var root = ctx.root
    var parent = _authoring_find(root, params.get("parent_path", "root"))
    if parent == null:
        quit(1)
        return
    var sub = params.sub_scene
    if not sub.begins_with("res://"):
        sub = "res://" + sub
    var packed = load(sub)
    if packed == null:
        printerr("Sub-scene not found: " + str(sub))
        quit(1)
        return
    var inst = packed.instantiate()
    if params.has("name"):
        inst.name = params.name
    if params.has("position") and inst is Node2D:
        var pos = params.position
        inst.position = Vector2(float(pos[0]), float(pos[1]))
    parent.add_child(inst)
    inst.owner = root
    _authoring_save(root, ctx.abs, "Instanced " + str(sub) + " under " + str(parent.name))

# Print the scene tree (name : type per node) to stdout — inspection for the agent.
# params: scene_path
func get_scene_tree(params):
    var ctx = _authoring_load(params)
    if ctx == null:
        return
    _print_tree(ctx.root, 0)
    print("SCENE TREE OK")

func _print_tree(node, depth):
    var pad = ""
    for i in depth:
        pad += "  "
    var scr = ""
    if node.get_script() != null:
        scr = " [script]"
    print(pad + str(node.name) + " : " + node.get_class() + scr)
    for child in node.get_children():
        _print_tree(child, depth + 1)

# ── PROJECT-LEVEL ops (operate on project.godot, no scene) ──────────────────────

# Define an InputMap action (so Input.is_action_pressed works — the missing-binding fix).
# params: action, deadzone?, events:[{type:"key"|"joy_button"|"mouse_button", key?:"X", button?:0}]
func add_input_action(params):
    var action = "input/" + str(params.action)
    var events = []
    for e in params.get("events", []):
        var t = e.get("type", "key")
        if t == "key":
            var ev = InputEventKey.new()
            var code = OS.find_keycode_from_string(str(e.get("key", "")))
            ev.physical_keycode = code
            ev.keycode = code
            events.append(ev)
        elif t == "joy_button":
            var jb = InputEventJoypadButton.new()
            jb.button_index = int(e.get("button", 0))
            events.append(jb)
        elif t == "mouse_button":
            var mb = InputEventMouseButton.new()
            mb.button_index = int(e.get("button", 1))
            events.append(mb)
    var entry = {"deadzone": float(params.get("deadzone", 0.5)), "events": events}
    ProjectSettings.set_setting(action, entry)
    var err = ProjectSettings.save()
    if err != OK:
        printerr("Failed to save project settings: " + str(err))
        quit(1)
        return
    print("Input action '" + str(params.action) + "' defined with " + str(events.size()) + " event(s)")

# Set arbitrary project settings (main scene, window size, stretch, physics tick...).
# params: settings:{ "application/run/main_scene":"res://main.tscn",
#   "display/window/size/viewport_width":1280, "display/window/stretch/mode":"canvas_items", ... }
func set_project_setting(params):
    var settings = params.get("settings", {})
    var count = 0
    for key in settings:
        var value = settings[key]
        # main_scene wants a res:// path string
        if typeof(value) == TYPE_STRING and (key as String).ends_with("main_scene") and not value.begins_with("res://"):
            value = "res://" + value
        ProjectSettings.set_setting(key, value)
        count += 1
    var err = ProjectSettings.save()
    if err != OK:
        printerr("Failed to save project settings: " + str(err))
        quit(1)
        return
    print("Set " + str(count) + " project setting(s)")
