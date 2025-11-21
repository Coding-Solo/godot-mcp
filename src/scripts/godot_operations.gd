#!/usr/bin/env -S godot --headless --script
extends SceneTree

# Debug mode flag
var debug_mode = false

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
    
    if not params:
        log_error("Failed to parse JSON parameters: " + params_json)
        quit(1)
    
    log_info("Executing operation: " + operation)
    
    match operation:
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
        "get_scene_structure":
            get_scene_structure(params)
        _:
            log_error("Unknown operation: " + operation)
            quit(1)
    
    quit()

# Logging functions
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    print("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)

# Get a script by name or path
func get_script_by_name(name_of_class):
    if debug_mode:
        print("Attempting to get script for class: " + name_of_class)
    
    # Try to load it directly if it's a resource path
    if ResourceLoader.exists(name_of_class, "Script"):
        if debug_mode:
            print("Resource exists, loading directly: " + name_of_class)
        var script = load(name_of_class) as Script
        if script:
            if debug_mode:
                print("Successfully loaded script from path")
            return script
        else:
            printerr("Failed to load script from path: " + name_of_class)
    elif debug_mode:
        print("Resource not found, checking global class registry")
    
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
            new_node.set(property, properties[property])
    
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

# Get scene structure operation
func get_scene_structure(params):
    # Note: No logging to avoid contaminating JSON output
    
    var scene_path = params.get("scene_path", "")
    var include_properties = params.get("include_properties", true)
    var include_connections = params.get("include_connections", true)
    var max_depth = params.get("max_depth", null)
    
    if debug_mode:
        print("Getting scene structure for: " + scene_path)
    
    if scene_path.is_empty():
        # Return error in JSON format instead of logging
        var error_result = {
            "scene_path": "",
            "structure": null,
            "error": "Scene path is required",
            "analysis_options": {}
        }
        print(JSON.stringify(error_result))
        quit(1)
    
    # Validate max_depth
    if max_depth != null and max_depth < 1:
        max_depth = 1
    elif max_depth != null and max_depth > 20:
        # No logging to avoid contaminating output
        max_depth = 20
    
    # Use text-based parsing to avoid script compilation issues
    var structure = null
    var error_info = null
    
    # Parse scene file as text to extract structure without loading scripts
    structure = parse_tscn_file(scene_path, include_properties, include_connections, max_depth)
    if structure == null:
        error_info = "Failed to parse scene file as text"
    
    # Output the result as JSON
    var result = {
        "scene_path": scene_path,
        "structure": structure,
        "error": error_info,
        "analysis_options": {
            "include_properties": include_properties,
            "include_connections": include_connections,
            "max_depth": max_depth
        }
    }
    
    var json_string = JSON.stringify(result)
    print(json_string)

# Parse .tscn file as text to extract structure without triggering script compilation
func parse_tscn_file(scene_path: String, include_properties: bool, _include_connections: bool, max_depth) -> Dictionary:
    if debug_mode:
        print("Parsing TSCN file: " + scene_path)
    return parse_tscn_file_recursive(scene_path, include_properties, _include_connections, max_depth, 0, {})

# Recursive version that handles nested scenes and prevents infinite loops
func parse_tscn_file_recursive(scene_path: String, include_properties: bool, _include_connections: bool, max_depth, current_depth: int, visited_scenes: Dictionary) -> Dictionary:
    # Prevent infinite recursion
    if current_depth > 10:
        return {"error": "Max recursion depth exceeded"}
    
    # Prevent circular scene references
    if visited_scenes.has(scene_path):
        return {"error": "Circular scene reference detected: " + scene_path}
    
    visited_scenes[scene_path] = true
    
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if not file:
        return {"error": "Failed to open scene file: " + scene_path}
    
    var content = file.get_as_text()
    file.close()
    
    # Parse the TSCN format
    var lines = content.split("\n")
    var nodes = []
    var connections = []
    var current_node = null
    var external_resources = {}
    var sub_scenes = {}
    
    # Parse external resources first
    for line in lines:
        line = line.strip_edges()
        if line.begins_with("[ext_resource"):
            var ext_resource = parse_ext_resource_line(line)
            if ext_resource:
                external_resources[ext_resource.id] = ext_resource
                # Track scene resources for recursive loading - check multiple possible types
                var resource_type = ext_resource.get("type", "")
                var resource_path = ext_resource.get("path", "")
                if resource_type == "PackedScene" or resource_type == "Scene" or resource_path.ends_with(".tscn"):
                    sub_scenes[ext_resource.id] = resource_path
                    if debug_mode:
                        print("Found scene resource: " + ext_resource.id + " -> " + resource_path)
        elif line.begins_with("[connection") and _include_connections:
            var connection = parse_connection_line(line)
            if connection and not connection.is_empty():
                connections.append(connection)
    
    # Parse nodes
    for i in range(lines.size()):
        var line = lines[i].strip_edges()
        
        if line.begins_with("[node"):
            # Parse node definition
            current_node = parse_node_line(line)
            
            if current_node:
                # Look ahead for properties
                for j in range(i + 1, lines.size()):
                    var prop_line = lines[j].strip_edges()
                    if prop_line.is_empty() or prop_line.begins_with("["):
                        break
                    if include_properties:
                        parse_node_property(current_node, prop_line, external_resources)
                    
                    # Check for instance property (sub-scene) in properties - enhanced detection
                    if "instance" in prop_line and "ExtResource" in prop_line:
                        var instance_id = extract_resource_id(prop_line)
                        
                        current_node["is_instance"] = true
                        current_node["instance_resource_id"] = instance_id
                        
                        if debug_mode:
                            print("Found instance property: " + current_node.get("name", "Unknown") + " -> " + instance_id)
                        
                        # Try to resolve the scene path
                        if sub_scenes.has(instance_id):
                            current_node["instance_scene"] = sub_scenes[instance_id]
                        elif external_resources.has(instance_id):
                            var resource = external_resources[instance_id]
                            if resource.get("type", "") == "PackedScene":
                                current_node["instance_scene"] = resource.get("path", "")
                                # Also add to sub_scenes for future reference
                                sub_scenes[instance_id] = resource.get("path", "")
                
                # Check for instance in node definition line (already parsed)
                if current_node.get("is_instance", false) and current_node.has("instance_resource_id"):
                    var instance_id = current_node["instance_resource_id"]
                    
                    # Enhanced resource resolution with multiple fallbacks
                    if not current_node.has("instance_scene") or current_node.get("instance_scene", "").is_empty():
                        if sub_scenes.has(instance_id):
                            current_node["instance_scene"] = sub_scenes[instance_id]
                        elif external_resources.has(instance_id):
                            var resource = external_resources[instance_id]
                            # Check both PackedScene and Scene types (some .tscn files use different type names)
                            var resource_type = resource.get("type", "")
                            if resource_type == "PackedScene" or resource_type == "Scene" or resource.get("path", "").ends_with(".tscn"):
                                var resource_scene_path = resource.get("path", "")
                                current_node["instance_scene"] = resource_scene_path
                                # Also add to sub_scenes for future reference
                                if not resource_scene_path.is_empty():
                                    sub_scenes[instance_id] = resource_scene_path
                
                nodes.append(current_node)
    
    # Build hierarchy with recursive scene loading
    if nodes.size() > 0:
        if debug_mode:
            print("Building hierarchy with " + str(nodes.size()) + " nodes")
        var hierarchy = build_node_hierarchy_recursive(nodes, max_depth, current_depth, visited_scenes, include_properties, _include_connections)
        
        # Add connections to the result if requested
        if _include_connections and connections.size() > 0:
            hierarchy["connections"] = connections
            if debug_mode:
                print("Added " + str(connections.size()) + " connections")
        
        # Remove the scene from visited set after processing (for other branches)
        visited_scenes.erase(scene_path)
        return hierarchy
    
    visited_scenes.erase(scene_path)
    return {"error": "No nodes found in scene file"}

# Parse external resource line
func parse_ext_resource_line(line: String) -> Dictionary:
    # [ext_resource type="Script" path="res://scripts/Player.gd" id="1_abcd"]
    var result = {}
    
    # Extract id
    var id_match = line.find('id="')
    if id_match > -1:
        var id_start = id_match + 4
        var id_end = line.find('"', id_start)
        if id_end > -1:
            result["id"] = line.substr(id_start, id_end - id_start)
    
    # Extract type
    var type_match = line.find('type="')
    if type_match > -1:
        var type_start = type_match + 6
        var type_end = line.find('"', type_start)
        if type_end > -1:
            result["type"] = line.substr(type_start, type_end - type_start)
    
    # Extract path
    var path_match = line.find('path="')
    if path_match > -1:
        var path_start = path_match + 6
        var path_end = line.find('"', path_start)
        if path_end > -1:
            result["path"] = line.substr(path_start, path_end - path_start)
    
    if debug_mode and result.has("id"):
        print("Extracted resource - ID: " + result.get("id", "") + ", Type: " + result.get("type", "") + ", Path: " + result.get("path", ""))
    
    return result if result.has("id") else {}

# Parse connection line from scene file
func parse_connection_line(line: String) -> Dictionary:
    # [connection signal="pressed" from="Button" to="." method="handle_press"]
    var result = {}
    
    # Extract signal
    var signal_match = line.find('signal="')
    if signal_match > -1:
        var signal_start = signal_match + 8
        var signal_end = line.find('"', signal_start)
        if signal_end > -1:
            result["signal"] = line.substr(signal_start, signal_end - signal_start)
    
    # Extract from
    var from_match = line.find('from="')
    if from_match > -1:
        var from_start = from_match + 6
        var from_end = line.find('"', from_start)
        if from_end > -1:
            result["from"] = line.substr(from_start, from_end - from_start)
    
    # Extract to
    var to_match = line.find('to="')
    if to_match > -1:
        var to_start = to_match + 4
        var to_end = line.find('"', to_start)
        if to_end > -1:
            result["to"] = line.substr(to_start, to_end - to_start)
    
    # Extract method
    var method_match = line.find('method="')
    if method_match > -1:
        var method_start = method_match + 8
        var method_end = line.find('"', method_start)
        if method_end > -1:
            result["method"] = line.substr(method_start, method_end - method_start)
    
    if debug_mode and result.size() > 0:
        print("Extracted connection - Signal: " + result.get("signal", "") + ", From: " + result.get("from", "") + ", To: " + result.get("to", "") + ", Method: " + result.get("method", ""))
    
    return result

# Extract resource ID from a property line like "instance = ExtResource("1_abc123")"
func extract_resource_id(line: String) -> String:
    # Handle both "ExtResource(" and "ExtResource (" formats (with or without space)
    var patterns = ['ExtResource("', 'ExtResource ("']
    
    for pattern in patterns:
        var start_pos = line.find(pattern)
        if start_pos != -1:
            start_pos += pattern.length()
            var end_pos = line.find('"', start_pos)
            if end_pos != -1:
                return line.substr(start_pos, end_pos - start_pos)
    
    return ""

# Parse node definition line
func parse_node_line(line: String) -> Dictionary:
    # [node name="Player" type="CharacterBody2D" parent="." script=ExtResource("1_abcd")]
    var result = {
        "properties": {},
        "children": [],
        "raw_line": line
    }
    
    # Extract name
    var name_match = line.find('name="')
    if name_match > -1:
        var name_start = name_match + 6
        var name_end = line.find('"', name_start)
        if name_end > -1:
            result["name"] = line.substr(name_start, name_end - name_start)
    
    # Extract type
    var type_match = line.find('type="')
    if type_match > -1:
        var type_start = type_match + 6
        var type_end = line.find('"', type_start)
        if type_end > -1:
            result["type"] = line.substr(type_start, type_end - type_start)
    
    # Extract parent
    var parent_match = line.find('parent="')
    if parent_match > -1:
        var parent_start = parent_match + 8
        var parent_end = line.find('"', parent_start)
        if parent_end > -1:
            result["parent"] = line.substr(parent_start, parent_end - parent_start)
    
    # Extract script reference from node line
    var script_match = line.find('script=')
    if script_match > -1:
        result["has_script"] = true
        # Try to extract script reference ID from ExtResource
        var ext_ref_id = extract_resource_id(line.substr(script_match))
        if not ext_ref_id.is_empty():
            result["script_resource_id"] = ext_ref_id
    
    # Extract instance reference from node line
    var instance_match = line.find('instance=')
    if instance_match > -1:
        result["is_instance"] = true
        # Try to extract instance reference ID from ExtResource
        var ext_ref_id = extract_resource_id(line.substr(instance_match))
        if not ext_ref_id.is_empty():
            result["instance_resource_id"] = ext_ref_id
        # If this is an instance, set a placeholder type that will be resolved later
        if result.get("type", "Unknown") == "Unknown":
            result["type"] = "SceneInstance"
        if debug_mode:
            print("Found instance node: " + result.get("name", "Unknown"))
    
    if debug_mode:
        print("Parsed node - Name: " + result.get("name", "Unknown") + ", Type: " + result.get("type", "Unknown") + ", Parent: " + result.get("parent", "Unknown") + ", Has Script: " + str(result.get("has_script", false)) + ", Is Instance: " + str(result.get("is_instance", false)))
    
    return result

# Parse a property line for a node
func parse_node_property(node: Dictionary, line: String, _external_resources: Dictionary):
    if not line.contains("="):
        return
    
    var parts = line.split("=", false, 1)
    if parts.size() != 2:
        return
    
    var key = parts[0].strip_edges()
    var value = parts[1].strip_edges()
    
    # Check for script property
    if key == "script":
        node["has_script"] = true
        var ext_ref_id = extract_resource_id(value)
        if not ext_ref_id.is_empty():
            node["script_resource_id"] = ext_ref_id
        if debug_mode:
            print("Found script property for node " + node.get("name", "Unknown") + " with resource ID: " + ext_ref_id)
    
    # Check for instance property (for custom scene instances)
    if key == "instance":
        node["is_instance"] = true
        var ext_ref_id = extract_resource_id(value)
        if not ext_ref_id.is_empty():
            node["instance_resource_id"] = ext_ref_id
        if debug_mode:
            print("Found instance property for node " + node.get("name", "Unknown") + " with resource ID: " + ext_ref_id)
    
    # Store raw property value
    node.properties[key] = {
        "type": "raw",
        "value": value
    }

# Build hierarchical structure from flat node list
func build_node_hierarchy(nodes: Array, max_depth) -> Dictionary:
    if debug_mode:
        print("Building node hierarchy from " + str(nodes.size()) + " nodes with max_depth: " + str(max_depth))
    
    if nodes.size() == 0:
        if debug_mode:
            print("No nodes to build hierarchy from")
        return {}
    
    # Find all root nodes (parent = ".")
    var root_nodes = []
    for node in nodes:
        if node.get("parent", "") == ".":
            root_nodes.append(node)
    
    if debug_mode:
        print("Found " + str(root_nodes.size()) + " root nodes")
    
    if root_nodes.size() == 0:
        # If no explicit root, use first node
        if debug_mode:
            print("No explicit root nodes, using first node as root")
        return build_tree_recursive(nodes[0], nodes, "", 0, max_depth)
    elif root_nodes.size() == 1:
        # Single root node - return it directly
        if debug_mode:
            print("Single root node found: " + root_nodes[0].get("name", "Unknown"))
        return build_tree_recursive(root_nodes[0], nodes, "", 0, max_depth)
    else:
        # Multiple root nodes - create a virtual container
        if debug_mode:
            print("Multiple root nodes found, creating virtual container")
        var virtual_root = {
            "name": "Scene Root",
            "type": "Scene",
            "path": "",
            "has_script": false,
            "children": []
        }
        
        # Build each root node and add to virtual root
        for root_node in root_nodes:
            var root_result = build_tree_recursive(root_node, nodes, "", 0, max_depth)
            if not root_result.is_empty():
                virtual_root.children.append(root_result)
        
        return virtual_root

# Build hierarchical structure from flat node list with recursive scene loading
func build_node_hierarchy_recursive(nodes: Array, max_depth, current_depth: int, visited_scenes: Dictionary, include_properties: bool, include_connections: bool) -> Dictionary:
    if nodes.size() == 0:
        return {}
    
    # Find all root nodes (parent = ".")
    var root_nodes = []
    for node in nodes:
        if node.get("parent", "") == ".":
            root_nodes.append(node)
    
    if root_nodes.size() == 0:
        # If no explicit root, use first node
        return build_tree_recursive_with_scenes(nodes[0], nodes, "", 0, max_depth, current_depth, visited_scenes, include_properties, include_connections)
    elif root_nodes.size() == 1:
        # Single root node - return it directly
        return build_tree_recursive_with_scenes(root_nodes[0], nodes, "", 0, max_depth, current_depth, visited_scenes, include_properties, include_connections)
    else:
        # Multiple root nodes - create a virtual container
        var virtual_root = {
            "name": "Scene Root",
            "type": "Scene",
            "path": "",
            "has_script": false,
            "is_instance": false,
            "children": []
        }
        
        # Build each root node and add to virtual root
        for root_node in root_nodes:
            var root_result = build_tree_recursive_with_scenes(root_node, nodes, "", 0, max_depth, current_depth, visited_scenes, include_properties, include_connections)
            if not root_result.is_empty():
                virtual_root.children.append(root_result)
        
        return virtual_root

# Recursively build tree structure
func build_tree_recursive(node: Dictionary, all_nodes: Array, node_path: String, depth: int, max_depth) -> Dictionary:
    if max_depth != null and depth >= max_depth:
        if debug_mode:
            print("Reached max depth " + str(max_depth) + ", stopping recursion")
        return {}
    
    var current_path = node_path
    if current_path.is_empty():
        current_path = node.get("name", "Unknown")
    else:
        current_path = current_path + "/" + node.get("name", "Unknown")
    
    var result = {
        "name": node.get("name", "Unknown"),
        "type": node.get("type", "Unknown"),
        "path": current_path,
        "has_script": node.get("has_script", false),
        "children": []
    }
    
    if node.has("properties"):
        result["properties"] = node.properties
    
    # Find children
    var node_name = node.get("name", "")
    for child_node in all_nodes:
        var child_parent = child_node.get("parent", "")
        if child_parent == node_name or child_parent == "./" + node_name:
            var child_result = build_tree_recursive(child_node, all_nodes, current_path, depth + 1, max_depth)
            if not child_result.is_empty():
                result.children.append(child_result)
    
    return result

# Recursively build tree structure with sub-scene loading
func build_tree_recursive_with_scenes(node: Dictionary, all_nodes: Array, node_path: String, depth: int, max_depth, scene_depth: int, visited_scenes: Dictionary, include_properties: bool, include_connections: bool) -> Dictionary:
    if max_depth != null and depth >= max_depth:
        return {}
    
    if scene_depth > 5:  # Prevent deep scene recursion
        if debug_mode:
            print("Reached max scene depth 5, stopping scene recursion")
        return {}
    
    var current_path = node_path
    if current_path.is_empty():
        current_path = node.get("name", "Unknown")
    else:
        current_path = current_path + "/" + node.get("name", "Unknown")
    
    # Determine the display type for instanced scenes
    var node_type = node.get("type", "Unknown")
    var display_type = node_type
    if node.get("is_instance", false):
        var instance_scene = node.get("instance_scene", "")
        if not instance_scene.is_empty():
            var scene_name = instance_scene.get_file().get_basename()
            display_type = scene_name + " (Scene Instance)"
            # Update the base type for scene instances
            node_type = "SceneInstance"
            if debug_mode:
                print("Node " + node.get("name", "Unknown") + " is instance of scene: " + instance_scene)
        else:
            # Instance detected but no scene path resolved
            # Use the node name as a fallback for better identification
            var instance_node_name = node.get("name", "Unknown")
            display_type = instance_node_name + " (Scene Instance)"
            node_type = "SceneInstance"
            if debug_mode:
                print("Node " + node.get("name", "Unknown") + " is instance but scene path not resolved")
    
    var result = {
        "name": node.get("name", "Unknown"),
        "type": display_type,
        "base_type": node_type,
        "path": current_path,
        "has_script": node.get("has_script", false),
        "is_instance": node.get("is_instance", false),
        "children": []
    }
    
    # Add instance information if available
    if node.get("is_instance", false):
        result["instance_scene"] = node.get("instance_scene", "")
    
    if node.has("properties"):
        result["properties"] = node.properties
    
    # If this node is an instance of another scene, load that scene recursively
    if node.get("is_instance", false) and node.has("instance_scene"):
        var instance_scene_path = node.get("instance_scene", "")
        if not instance_scene_path.is_empty():
            if debug_mode:
                print("Loading sub-scene structure for: " + instance_scene_path)
            var sub_scene_structure = parse_tscn_file_recursive(instance_scene_path, include_properties, include_connections, max_depth, scene_depth + 1, visited_scenes)
            if sub_scene_structure.has("structure") and sub_scene_structure.structure != null:
                result["instance_structure"] = sub_scene_structure.structure
            elif not sub_scene_structure.has("error"):
                result["instance_structure"] = sub_scene_structure
            elif debug_mode:
                print("Failed to load sub-scene structure for: " + instance_scene_path + " - " + str(sub_scene_structure.get("error", "Unknown error")))
    
    # Find children in current scene
    var node_name = node.get("name", "")
    for child_node in all_nodes:
        var child_parent = child_node.get("parent", "")
        if child_parent == node_name or child_parent == "./" + node_name:
            var child_result = build_tree_recursive_with_scenes(child_node, all_nodes, current_path, depth + 1, max_depth, scene_depth, visited_scenes, include_properties, include_connections)
            if not child_result.is_empty():
                result.children.append(child_result)
    
    return result

# Recursive node analysis with comprehensive error handling
func analyze_node_structure(node: Node, parent_path: String, include_properties: bool, include_connections: bool, max_depth, current_depth: int) -> Dictionary:
    if debug_mode:
        print("Analyzing node structure for: " + str(node.name) + " (" + node.get_class() + ") at depth " + str(current_depth))
    
    # Safety check for runaway recursion
    if current_depth > 50:
        if debug_mode:
            print("Max recursion depth exceeded at node: " + str(node.name))
        # Return error silently to avoid contaminating JSON output
        return {"error": "max_recursion_exceeded"}
    
    # Construct the node path manually to avoid scene tree issues
    var node_path = parent_path
    if node_path.is_empty():
        node_path = node.name
    else:
        node_path = parent_path + "/" + node.name
    
    var structure = {
        "name": str(node.name),
        "type": node.get_class(),
        "path": node_path,
        "children": [],
        "script_path": "",
        "has_script": false
    }
    
    # Safely check for script
    var node_script = node.get_script()
    if node_script != null:
        structure["has_script"] = true
        if node_script.resource_path != "":
            structure["script_path"] = node_script.resource_path
        if debug_mode:
            print("Node " + str(node.name) + " has script: " + node_script.resource_path)
    
    # Add properties if requested and safe to access
    if include_properties:
        if debug_mode:
            print("Getting properties for node: " + str(node.name))
        structure["properties"] = get_node_properties(node)
    
    # Add connections if requested and safe to access
    if include_connections:
        if debug_mode:
            print("Getting connections for node: " + str(node.name))
        structure["connections"] = get_node_connections(node)
    
    # Add children if we haven't reached max depth
    if max_depth == null or current_depth < max_depth:
        var child_count = node.get_child_count()
        if debug_mode:
            print("Node " + str(node.name) + " has " + str(child_count) + " children")
        for i in range(child_count):
            var child = node.get_child(i)
            if child != null:
                var child_structure = analyze_node_structure(child, node_path, include_properties, include_connections, max_depth, current_depth + 1)
                if child_structure != null:
                    structure["children"].append(child_structure)
    elif debug_mode:
        print("Reached max depth " + str(max_depth) + ", not analyzing children of: " + str(node.name))
    
    return structure

# Property access that handles script compilation errors
func get_node_properties(node: Node) -> Dictionary:
    var properties = {}
    
    if debug_mode:
        print("Getting properties for node: " + node.name + " (type: " + node.get_class() + ")")
    
    # Use Godot's built-in property reflection to get ALL properties
    # This is much cleaner than manually checking each property type
    var property_list = node.get_property_list()
    
    for property_info in property_list:
        var property_name = property_info["name"]
        var property_type = property_info["type"]
        var property_usage = property_info.get("usage", 0)
        
        # Skip internal/private properties (those starting with _)
        if property_name.begins_with("_"):
            continue
            
        # Skip properties that are not meant to be serialized/edited
        # PROPERTY_USAGE_STORAGE = 2, PROPERTY_USAGE_EDITOR = 4
        if (property_usage & 6) == 0:  # Not storage or editor visible
            continue
            
        # Skip script-related properties to avoid compilation issues
        if property_name == "script" or property_name.begins_with("script_"):
            continue
            
        # Safely get the property value with error handling
        var property_value = _safe_get_property(node, property_name, property_type)
        if property_value != null:
            properties[property_name] = property_value
            
    if debug_mode:
        print("Found " + str(properties.size()) + " properties for " + node.name)
    
    return properties

# Safely get a property value with type conversion and error handling
func _safe_get_property(node: Node, property_name: String, property_type: int):
    if debug_mode:
        print("Getting property '" + property_name + "' of type " + type_string(property_type) + " from node " + node.name)
    
    # Try to get the property value safely
    var value = null
    var type_name = "unknown"
    
    # Use a try-catch equivalent by checking if the property exists
    if not node.has_method("get") and not (property_name in node):
        if debug_mode:
            print("Property '" + property_name + "' not accessible on node " + node.name)
        return null
        
    # Get the value with error protection
    if node.has_method("get"):
        value = node.get(property_name)
    else:
        # Fallback for direct property access
        value = node.get(property_name) if property_name in node else null
    
    if value == null:
        if debug_mode:
            print("Property '" + property_name + "' is null on node " + node.name)
        return null
    
    # Use Godot's built-in type name function, with custom serialization for complex types
    type_name = type_string(property_type)
    
    if debug_mode:
        print("Property '" + property_name + "' has value of type: " + type_name)
    
    # Handle complex types that need special serialization for JSON output
    match property_type:
        TYPE_VECTOR2, TYPE_VECTOR2I:
            value = {"x": value.x, "y": value.y}
        TYPE_VECTOR3, TYPE_VECTOR3I:
            value = {"x": value.x, "y": value.y, "z": value.z}
        TYPE_VECTOR4, TYPE_VECTOR4I:
            value = {"x": value.x, "y": value.y, "z": value.z, "w": value.w}
        TYPE_RECT2:
            value = {"position": {"x": value.position.x, "y": value.position.y}, "size": {"x": value.size.x, "y": value.size.y}}
        TYPE_PLANE:
            value = {"normal": {"x": value.normal.x, "y": value.normal.y, "z": value.normal.z}, "d": value.d}
        TYPE_QUATERNION:
            value = {"x": value.x, "y": value.y, "z": value.z, "w": value.w}
        TYPE_COLOR:
            value = {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
        TYPE_AABB:
            value = {"position": {"x": value.position.x, "y": value.position.y, "z": value.position.z}, "size": {"x": value.size.x, "y": value.size.y, "z": value.size.z}}
        TYPE_TRANSFORM2D:
            value = {"origin": {"x": value.origin.x, "y": value.origin.y}, "x": {"x": value.x.x, "y": value.x.y}, "y": {"x": value.y.x, "y": value.y.y}}
        TYPE_BASIS:
            value = {"x": {"x": value.x.x, "y": value.x.y, "z": value.x.z}, "y": {"x": value.y.x, "y": value.y.y, "z": value.y.z}, "z": {"x": value.z.x, "y": value.z.y, "z": value.z.z}}
        TYPE_TRANSFORM3D:
            value = {"basis": {"x": {"x": value.basis.x.x, "y": value.basis.x.y, "z": value.basis.x.z}, "y": {"x": value.basis.y.x, "y": value.basis.y.y, "z": value.basis.y.z}, "z": {"x": value.basis.z.x, "y": value.basis.z.y, "z": value.basis.z.z}}, "origin": {"x": value.origin.x, "y": value.origin.y, "z": value.origin.z}}
        TYPE_OBJECT:
            # For objects, try to get resource path or basic info
            if value.has_method("get_class"):
                var obj_class_name = value.get_class()
                if value.has_method("get_path") and not str(value.get_path()).is_empty():
                    value = {"class": obj_class_name, "path": str(value.get_path())}
                elif value.has_method("resource_path") and not value.resource_path.is_empty():
                    value = {"class": obj_class_name, "resource_path": value.resource_path}
                else:
                    value = {"class": obj_class_name, "id": value.get_instance_id()}
            else:
                value = str(value)
        TYPE_STRING_NAME, TYPE_NODE_PATH, TYPE_RID, TYPE_CALLABLE, TYPE_SIGNAL, TYPE_PROJECTION:
            value = str(value)
        # TYPE_DICTIONARY and TYPE_ARRAY are already serializable, no conversion needed
    
    return {
        "type": type_name,
        "value": value
    }

# Connection analysis that avoids triggering script compilation
func get_node_connections(node: Node) -> Array:
    var connections = []
    
    if debug_mode:
        print("Getting connections for node: " + node.name + " (" + node.get_class() + ")")
    
    # Only try to get connections if the node seems stable
    # Skip connection analysis if it might cause script compilation issues
    var signal_list = node.get_signal_list()
    
    if debug_mode:
        print("Node " + node.name + " has " + str(signal_list.size()) + " signals")
    
    # Limit the number of signals we check to avoid performance issues
    var signal_count = 0
    for signal_info in signal_list:
        if signal_count >= 10:  # Limit to first 10 signals
            if debug_mode:
                print("Reached signal limit of 10 for node " + node.name)
            break
            
        var signal_name = signal_info["name"]
        
        # Skip signals that might cause issues
        if signal_name.begins_with("_"):
            continue
            
        var signal_connections = node.get_signal_connection_list(signal_name)
        
        if debug_mode and signal_connections.size() > 0:
            print("Signal '" + signal_name + "' has " + str(signal_connections.size()) + " connections")
        
        for connection in signal_connections:
            var target_info = "unknown"
            if connection.has("target") and connection["target"]:
                # Safely get target info without using get_path()
                target_info = str(connection["target"].name) if "name" in connection["target"] else "unknown"
            
            var connection_info = {
                "signal": signal_name,
                "target": target_info,
                "method": connection.get("method", "unknown"),
                "flags": connection.get("flags", 0)
            }
            connections.append(connection_info)
            
        signal_count += 1
    
    if debug_mode:
        print("Found " + str(connections.size()) + " total connections for node " + node.name)
    
    return connections
