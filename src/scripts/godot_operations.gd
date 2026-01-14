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
    
    if params == null:
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
        # Phase 1: Scene Operations (V3 Enhancement)
        "list_scene_nodes":
            list_scene_nodes(params)
        "get_node_properties":
            get_node_properties(params)
        "set_node_properties":
            set_node_properties(params)
        "delete_node":
            delete_node(params)
        "duplicate_node":
            duplicate_node(params)
        "reparent_node":
            reparent_node(params)
        # Phase 2: Import/Export Pipeline (V3 Enhancement)
        "get_import_status":
            get_import_status(params)
        "get_import_options":
            get_import_options(params)
        "set_import_options":
            set_import_options(params)
        "reimport_resource":
            reimport_resource(params)
        "list_export_presets":
            list_export_presets(params)
        "validate_project":
            validate_project(params)
        # Phase 3: Developer Experience Tools
        "get_dependencies":
            get_dependencies(params)
        "find_resource_usages":
            find_resource_usages(params)
        "parse_error_log":
            parse_error_log(params)
        "get_project_health":
            get_project_health(params)
        # Phase 3: Configuration Management Tools
        "get_project_setting":
            get_project_setting(params)
        "set_project_setting":
            set_project_setting(params)
        "add_autoload":
            add_autoload(params)
        "remove_autoload":
            remove_autoload(params)
        "list_autoloads":
            list_autoloads(params)
        "set_main_scene":
            set_main_scene(params)
        # Signal Management
        "connect_signal":
            connect_signal(params)
        "disconnect_signal":
            disconnect_signal(params)
        "list_connections":
            list_connections(params)
        # GDScript File Operations
        "create_script":
            create_gdscript(params)
        "modify_script":
            modify_gdscript(params)
        "get_script_info":
            get_gdscript_info(params)
        # Resource Creation Tools
        "create_resource":
            create_resource(params)
        "create_material":
            create_material(params)
        "create_shader":
            create_shader(params)
        # Animation Tools
        "create_animation":
            create_animation(params)
        "add_animation_track":
            add_animation_track(params)
        # Plugin Management Tools
        "list_plugins":
            list_plugins(params)
        "enable_plugin":
            enable_plugin(params)
        "disable_plugin":
            disable_plugin(params)
        # Input Action Tools
        "add_input_action":
            add_input_action(params)
        # Project Search Tool
        "search_project":
            search_project(params)
        # 2D Tile Tools
        "create_tileset":
            create_tileset(params)
        "set_tilemap_cells":
            set_tilemap_cells(params)
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

# ============================================
# GDScript File Operations
# ============================================

# Create a new GDScript file with proper structure and optional templates
func create_gdscript(params):
    var script_path = params.script_path
    var cls_name_param = params.get("class_name", "")
    var extends_class = params.get("extends_class", "Node")
    var content = params.get("content", "")
    var template = params.get("template", "")
    
    log_info("Creating GDScript: " + script_path)
    
    # Ensure script path has res:// prefix
    var full_script_path = script_path
    if not full_script_path.begins_with("res://"):
        full_script_path = "res://" + full_script_path
    
    # Validate script path ends with .gd
    if not full_script_path.ends_with(".gd"):
        log_error("Script path must end with .gd extension")
        quit(1)
    
    # Check if file already exists
    if FileAccess.file_exists(full_script_path):
        log_error("Script file already exists: " + full_script_path)
        quit(1)
    
    # Create parent directories if needed
    var dir = DirAccess.open("res://")
    var script_dir = full_script_path.get_base_dir()
    if script_dir != "res://" and not dir.dir_exists(script_dir.substr(6)):
        log_debug("Creating directory: " + script_dir)
        var error = dir.make_dir_recursive(script_dir.substr(6))
        if error != OK:
            log_error("Failed to create directory: " + script_dir + ", error: " + str(error))
            quit(1)
    
    # Build script content
    var script_content = ""
    
    # Add class_name if provided
    if not cls_name_param.is_empty():
        script_content += "class_name " + cls_name_param + "\n"
    
    # Add extends
    script_content += "extends " + extends_class + "\n\n"
    
    # Add template content or custom content
    if not template.is_empty():
        script_content += get_script_template(template, extends_class)
    elif not content.is_empty():
        script_content += content
    else:
        # Default minimal template
        script_content += "# Called when the node enters the scene tree for the first time.\n"
        script_content += "func _ready() -> void:\n"
        script_content += "\tpass\n"
    
    # Write the script file
    var file = FileAccess.open(full_script_path, FileAccess.WRITE)
    if not file:
        log_error("Failed to create script file: " + full_script_path)
        quit(1)
    
    file.store_string(script_content)
    file.close()
    
    # Get absolute path for result
    var absolute_path = ProjectSettings.globalize_path(full_script_path)
    
    var result = {
        "success": true,
        "script_path": script_path,
        "full_path": full_script_path,
        "absolute_path": absolute_path,
        "registered": not cls_name_param.is_empty(),
        "extends": extends_class,
        "template_used": template if not template.is_empty() else "none"
    }
    
    print(JSON.stringify(result))

# Get script template content based on template name
func get_script_template(template_name: String, extends_class: String) -> String:
    match template_name:
        "singleton":
            return """## Singleton (Autoload) script
## Add to Project Settings -> Autoload to use as a global singleton

var _instance: Object = null

func _init() -> void:
\tif _instance != null:
\t\tpush_error("Singleton instance already exists!")
\t\treturn
\t_instance = self

func _ready() -> void:
\tpass

# Add your singleton methods here
"""
        "state_machine":
            return """## Finite State Machine implementation

signal state_changed(old_state: String, new_state: String)

var current_state: String = ""
var states: Dictionary = {}

func _ready() -> void:
\t_setup_states()
\tif states.size() > 0:
\t\tchange_state(states.keys()[0])

func _setup_states() -> void:
\t# Override this to add states
\t# Example: states["idle"] = IdleState.new()
\tpass

func _process(delta: float) -> void:
\tif current_state.is_empty():
\t\treturn
\tif states.has(current_state) and states[current_state].has_method("process"):
\t\tstates[current_state].process(delta)

func _physics_process(delta: float) -> void:
\tif current_state.is_empty():
\t\treturn
\tif states.has(current_state) and states[current_state].has_method("physics_process"):
\t\tstates[current_state].physics_process(delta)

func change_state(new_state: String) -> void:
\tif not states.has(new_state):
\t\tpush_error("State not found: " + new_state)
\t\treturn
\t
\tvar old_state = current_state
\t
\tif not old_state.is_empty() and states.has(old_state):
\t\tif states[old_state].has_method("exit"):
\t\t\tstates[old_state].exit()
\t
\tcurrent_state = new_state
\t
\tif states[current_state].has_method("enter"):
\t\tstates[current_state].enter()
\t
\tstate_changed.emit(old_state, new_state)
"""
        "component":
            return """## Component pattern - attach to nodes to add behavior

@export var enabled: bool = true

func _ready() -> void:
\tif not enabled:
\t\tset_process(false)
\t\tset_physics_process(false)

func _process(delta: float) -> void:
\tif not enabled:
\t\treturn
\t# Component logic here
\tpass

func enable() -> void:
\tenabled = true
\tset_process(true)
\tset_physics_process(true)

func disable() -> void:
\tenabled = false
\tset_process(false)
\tset_physics_process(false)
"""
        "resource":
            return """## Custom Resource - save and load data

@export var id: String = ""
@export var display_name: String = ""
@export var description: String = ""

func _init(p_id: String = "", p_name: String = "", p_desc: String = "") -> void:
\tid = p_id
\tdisplay_name = p_name
\tdescription = p_desc

func duplicate_resource() -> Resource:
\tvar new_resource = self.duplicate()
\treturn new_resource
"""
        _:
            return """# Called when the node enters the scene tree for the first time.
func _ready() -> void:
\tpass

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
\tpass
"""

# Modify an existing GDScript file by adding functions, variables, or signals
func modify_gdscript(params):
    var script_path = params.script_path
    var modifications = params.modifications
    
    log_info("Modifying GDScript: " + script_path)
    
    # Ensure script path has res:// prefix
    var full_script_path = script_path
    if not full_script_path.begins_with("res://"):
        full_script_path = "res://" + full_script_path
    
    # Check if file exists
    if not FileAccess.file_exists(full_script_path):
        log_error("Script file does not exist: " + full_script_path)
        quit(1)
    
    # Read existing script content
    var file = FileAccess.open(full_script_path, FileAccess.READ)
    if not file:
        log_error("Failed to open script file: " + full_script_path)
        quit(1)
    
    var original_content = file.get_as_text()
    file.close()
    
    var lines = original_content.split("\n")
    var modifications_applied = []
    
    # Process each modification
    for mod in modifications:
        var mod_type = mod.get("type", "")
        var mod_name = mod.get("name", "")
        
        if mod_name.is_empty():
            log_error("Modification missing 'name' field")
            continue
        
        match mod_type:
            "add_variable":
                var result = add_variable_to_script(lines, mod)
                if result["success"]:
                    lines = result["lines"]
                    modifications_applied.append({
                        "type": "add_variable",
                        "name": mod_name,
                        "line": result["line"]
                    })
            "add_signal":
                var result = add_signal_to_script(lines, mod)
                if result["success"]:
                    lines = result["lines"]
                    modifications_applied.append({
                        "type": "add_signal",
                        "name": mod_name,
                        "line": result["line"]
                    })
            "add_function":
                var result = add_function_to_script(lines, mod)
                if result["success"]:
                    lines = result["lines"]
                    modifications_applied.append({
                        "type": "add_function",
                        "name": mod_name,
                        "line": result["line"]
                    })
            _:
                log_error("Unknown modification type: " + mod_type)
    
    # Write modified content back
    var new_content = "\n".join(lines)
    file = FileAccess.open(full_script_path, FileAccess.WRITE)
    if not file:
        log_error("Failed to write to script file: " + full_script_path)
        quit(1)
    
    file.store_string(new_content)
    file.close()
    
    var result = {
        "success": true,
        "script_path": script_path,
        "modifications_applied": modifications_applied,
        "total_modifications": modifications_applied.size()
    }
    
    print(JSON.stringify(result))

# Helper: Add a variable to script lines
func add_variable_to_script(lines: Array, mod: Dictionary) -> Dictionary:
    var var_name = mod.get("name", "")
    var var_type = mod.get("varType", "")
    var default_value = mod.get("defaultValue", "")
    var is_export = mod.get("isExport", false)
    var export_hint = mod.get("exportHint", "")
    var is_onready = mod.get("isOnready", false)
    
    # Build variable declaration
    var var_line = ""
    
    if is_export:
        if not export_hint.is_empty():
            var_line += "@export_" + export_hint + " "
        else:
            var_line += "@export "
    
    if is_onready:
        var_line += "@onready "
    
    var_line += "var " + var_name
    
    if not var_type.is_empty():
        var_line += ": " + var_type
    
    if not default_value.is_empty():
        var_line += " = " + default_value
    
    # Find insertion point (after extends/class_name, before functions)
    var insert_line = find_variable_insertion_point(lines)
    
    # Insert the variable
    lines.insert(insert_line, var_line)
    
    return {"success": true, "lines": lines, "line": insert_line + 1}

# Helper: Add a signal to script lines
func add_signal_to_script(lines: Array, mod: Dictionary) -> Dictionary:
    var signal_name = mod.get("name", "")
    var signal_params = mod.get("params", "")
    
    # Build signal declaration
    var signal_line = "signal " + signal_name
    if not signal_params.is_empty():
        signal_line += "(" + signal_params + ")"
    
    # Find insertion point (after extends/class_name, before variables)
    var insert_line = find_signal_insertion_point(lines)
    
    # Insert the signal
    lines.insert(insert_line, signal_line)
    
    return {"success": true, "lines": lines, "line": insert_line + 1}

# Helper: Add a function to script lines
func add_function_to_script(lines: Array, mod: Dictionary) -> Dictionary:
    var func_name = mod.get("name", "")
    var func_params = mod.get("params", "")
    var return_type = mod.get("returnType", "")
    var body = mod.get("body", "pass")
    var position = mod.get("position", "end")
    
    # Build function declaration
    var func_lines = []
    var func_decl = "func " + func_name + "(" + func_params + ")"
    
    if not return_type.is_empty():
        func_decl += " -> " + return_type
    
    func_decl += ":"
    func_lines.append("")
    func_lines.append(func_decl)
    
    # Add body lines with proper indentation
    var body_lines = body.split("\n")
    for bl in body_lines:
        func_lines.append("\t" + bl)
    
    # Find insertion point based on position parameter
    var insert_line = find_function_insertion_point(lines, position)
    
    # Insert the function
    for i in range(func_lines.size() - 1, -1, -1):
        lines.insert(insert_line, func_lines[i])
    
    return {"success": true, "lines": lines, "line": insert_line + 1}

# Helper: Find insertion point for variables
func find_variable_insertion_point(lines: Array) -> int:
    var after_header = 0
    var before_func = lines.size()
    
    for i in range(lines.size()):
        var line = lines[i].strip_edges()
        if line.begins_with("extends ") or line.begins_with("class_name "):
            after_header = i + 1
        elif line.begins_with("signal "):
            after_header = i + 1
        elif line.begins_with("func ") or line.begins_with("static func "):
            before_func = i
            break
    
    # Find last variable declaration
    for i in range(after_header, before_func):
        var line = lines[i].strip_edges()
        if line.begins_with("var ") or line.begins_with("@export") or line.begins_with("@onready"):
            after_header = i + 1
    
    return after_header

# Helper: Find insertion point for signals
func find_signal_insertion_point(lines: Array) -> int:
    var after_header = 0
    
    for i in range(lines.size()):
        var line = lines[i].strip_edges()
        if line.begins_with("extends ") or line.begins_with("class_name "):
            after_header = i + 1
        elif line.begins_with("signal "):
            after_header = i + 1
        elif line.begins_with("var ") or line.begins_with("@export") or line.begins_with("@onready") or line.begins_with("func "):
            break
    
    return after_header

# Helper: Find insertion point for functions
func find_function_insertion_point(lines: Array, position: String) -> int:
    match position:
        "after_ready":
            # Find _ready function and insert after it
            var in_ready = false
            var ready_end = -1
            for i in range(lines.size()):
                var line = lines[i].strip_edges()
                if line.begins_with("func _ready"):
                    in_ready = true
                elif in_ready and (line.begins_with("func ") or line.begins_with("static func ")):
                    return i
            return lines.size()
        "after_init":
            # Find _init function and insert after it
            var in_init = false
            for i in range(lines.size()):
                var line = lines[i].strip_edges()
                if line.begins_with("func _init"):
                    in_init = true
                elif in_init and (line.begins_with("func ") or line.begins_with("static func ")):
                    return i
            return lines.size()
        _:  # "end" or default
            return lines.size()

# Analyze a GDScript file and return its structure
func get_gdscript_info(params):
    var script_path = params.script_path
    var include_inherited = params.get("include_inherited", false)
    
    log_info("Analyzing GDScript: " + script_path)
    
    # Ensure script path has res:// prefix
    var full_script_path = script_path
    if not full_script_path.begins_with("res://"):
        full_script_path = "res://" + full_script_path
    
    # Check if file exists
    if not FileAccess.file_exists(full_script_path):
        log_error("Script file does not exist: " + full_script_path)
        quit(1)
    
    # Read script content
    var file = FileAccess.open(full_script_path, FileAccess.READ)
    if not file:
        log_error("Failed to open script file: " + full_script_path)
        quit(1)
    
    var content = file.get_as_text()
    file.close()
    
    var lines = content.split("\n")
    
    var result = {
        "path": script_path,
        "full_path": full_script_path,
        "class_name": null,
        "extends": "RefCounted",
        "signals": [],
        "variables": [],
        "functions": [],
        "constants": [],
        "enums": [],
        "inner_classes": [],
        "dependencies": [],
        "line_count": lines.size()
    }
    
    var current_enum = null
    var in_multiline_string = false
    
    for i in range(lines.size()):
        var line = lines[i]
        var stripped = line.strip_edges()
        
        # Skip empty lines and comments
        if stripped.is_empty() or stripped.begins_with("#"):
            continue
        
        # Handle multiline strings
        if '"""' in stripped or "'''" in stripped:
            in_multiline_string = not in_multiline_string
            continue
        
        if in_multiline_string:
            continue
        
        # Parse class_name
        if stripped.begins_with("class_name "):
            result["class_name"] = stripped.substr(11).strip_edges()
        
        # Parse extends
        elif stripped.begins_with("extends "):
            result["extends"] = stripped.substr(8).strip_edges()
        
        # Parse signals
        elif stripped.begins_with("signal "):
            var signal_info = parse_signal(stripped, i + 1)
            result["signals"].append(signal_info)
        
        # Parse constants
        elif stripped.begins_with("const "):
            var const_info = parse_constant(stripped, i + 1)
            result["constants"].append(const_info)
        
        # Parse enums
        elif stripped.begins_with("enum "):
            var enum_info = parse_enum(stripped, i + 1)
            result["enums"].append(enum_info)
        
        # Parse variables
        elif stripped.begins_with("var ") or stripped.begins_with("@export") or stripped.begins_with("@onready"):
            var var_info = parse_variable(stripped, i + 1)
            result["variables"].append(var_info)
        
        # Parse functions
        elif stripped.begins_with("func ") or stripped.begins_with("static func "):
            var func_info = parse_function(stripped, i + 1)
            result["functions"].append(func_info)
        
        # Parse inner classes
        elif stripped.begins_with("class "):
            var cls_name = stripped.substr(6).split(":")[0].split(" ")[0].strip_edges()
            result["inner_classes"].append(cls_name)
        
        # Parse dependencies (preload, load)
        if "preload(" in stripped or "load(" in stripped:
            var deps = extract_dependencies(stripped)
            for dep in deps:
                if dep not in result["dependencies"]:
                    result["dependencies"].append(dep)
    
    print(JSON.stringify(result))

# Helper: Parse a signal declaration
func parse_signal(line: String, line_num: int) -> Dictionary:
    var signal_text = line.substr(7).strip_edges()
    var signal_name = ""
    var params = []
    
    if "(" in signal_text:
        var parts = signal_text.split("(")
        signal_name = parts[0].strip_edges()
        if parts.size() > 1:
            var params_text = parts[1].replace(")", "").strip_edges()
            if not params_text.is_empty():
                var param_parts = params_text.split(",")
                for p in param_parts:
                    var param = parse_param(p.strip_edges())
                    params.append(param)
    else:
        signal_name = signal_text
    
    return {
        "name": signal_name,
        "params": params,
        "line": line_num
    }

# Helper: Parse a constant declaration
func parse_constant(line: String, line_num: int) -> Dictionary:
    var const_text = line.substr(6).strip_edges()
    var name = ""
    var value = ""
    var type_hint = ""
    
    if "=" in const_text:
        var parts = const_text.split("=", true, 1)
        var name_part = parts[0].strip_edges()
        value = parts[1].strip_edges() if parts.size() > 1 else ""
        
        if ":" in name_part:
            var type_parts = name_part.split(":")
            name = type_parts[0].strip_edges()
            type_hint = type_parts[1].strip_edges()
        else:
            name = name_part
    else:
        name = const_text
    
    return {
        "name": name,
        "value": value,
        "type": type_hint,
        "line": line_num
    }

# Helper: Parse an enum declaration
func parse_enum(line: String, line_num: int) -> Dictionary:
    var enum_text = line.substr(5).strip_edges()
    var enum_name = ""
    var values = []
    
    if "{" in enum_text:
        var parts = enum_text.split("{")
        enum_name = parts[0].strip_edges()
        if parts.size() > 1:
            var values_text = parts[1].replace("}", "").strip_edges()
            if not values_text.is_empty():
                var value_parts = values_text.split(",")
                for v in value_parts:
                    var val = v.strip_edges()
                    if not val.is_empty():
                        values.append(val)
    else:
        enum_name = enum_text
    
    return {
        "name": enum_name,
        "values": values,
        "line": line_num
    }

# Helper: Parse a variable declaration
func parse_variable(line: String, line_num: int) -> Dictionary:
    var is_export = line.begins_with("@export")
    var is_onready = "@onready" in line
    var export_hint = ""
    
    # Extract export hint
    if is_export:
        var export_match = line.find("@export")
        var var_pos = line.find("var ")
        if var_pos > export_match:
            var hint_part = line.substr(export_match + 7, var_pos - export_match - 7).strip_edges()
            if hint_part.begins_with("_"):
                export_hint = hint_part.substr(1).split(" ")[0]
    
    # Find var declaration
    var var_pos = line.find("var ")
    if var_pos == -1:
        return {"name": "", "line": line_num}
    
    var var_text = line.substr(var_pos + 4).strip_edges()
    var name = ""
    var type_hint = ""
    var default_value = ""
    
    if "=" in var_text:
        var parts = var_text.split("=", true, 1)
        var name_part = parts[0].strip_edges()
        default_value = parts[1].strip_edges() if parts.size() > 1 else ""
        
        if ":" in name_part:
            var type_parts = name_part.split(":")
            name = type_parts[0].strip_edges()
            type_hint = type_parts[1].strip_edges()
        else:
            name = name_part
    elif ":" in var_text:
        var type_parts = var_text.split(":")
        name = type_parts[0].strip_edges()
        type_hint = type_parts[1].strip_edges()
    else:
        name = var_text.split(" ")[0].strip_edges()
    
    return {
        "name": name,
        "type": type_hint,
        "default_value": default_value,
        "is_export": is_export,
        "export_hint": export_hint,
        "is_onready": is_onready,
        "line": line_num
    }

# Helper: Parse a function declaration
func parse_function(line: String, line_num: int) -> Dictionary:
    var is_static = line.begins_with("static ")
    var func_text = line
    
    if is_static:
        func_text = line.substr(7).strip_edges()
    
    func_text = func_text.substr(5).strip_edges()  # Remove "func "
    
    var name = ""
    var params = []
    var return_type = ""
    var is_virtual = false
    
    if "(" in func_text:
        var paren_start = func_text.find("(")
        name = func_text.substr(0, paren_start).strip_edges()
        
        var paren_end = func_text.rfind(")")
        if paren_end > paren_start:
            var params_text = func_text.substr(paren_start + 1, paren_end - paren_start - 1)
            if not params_text.is_empty():
                var param_parts = params_text.split(",")
                for p in param_parts:
                    var param = parse_param(p.strip_edges())
                    params.append(param)
        
        # Check for return type
        var after_paren = func_text.substr(paren_end + 1).strip_edges()
        if after_paren.begins_with("->"):
            return_type = after_paren.substr(2).replace(":", "").strip_edges()
    
    is_virtual = name.begins_with("_")
    
    return {
        "name": name,
        "params": params,
        "return_type": return_type,
        "is_virtual": is_virtual,
        "is_static": is_static,
        "line": line_num
    }

# Helper: Parse a function/signal parameter
func parse_param(param_text: String) -> Dictionary:
    var name = ""
    var type_hint = ""
    var default_value = ""
    
    if "=" in param_text:
        var parts = param_text.split("=", true, 1)
        var name_part = parts[0].strip_edges()
        default_value = parts[1].strip_edges() if parts.size() > 1 else ""
        
        if ":" in name_part:
            var type_parts = name_part.split(":")
            name = type_parts[0].strip_edges()
            type_hint = type_parts[1].strip_edges()
        else:
            name = name_part
    elif ":" in param_text:
        var type_parts = param_text.split(":")
        name = type_parts[0].strip_edges()
        type_hint = type_parts[1].strip_edges()
    else:
        name = param_text
    
    return {
        "name": name,
        "type": type_hint,
        "default": default_value
    }

# Helper: Extract dependencies from a line
func extract_dependencies(line: String) -> Array:
    var deps = []
    var regex = RegEx.new()
    
    # Match preload("...") and load("...")
    regex.compile('(?:preload|load)\\s*\\(\\s*["\']([^"\']+)["\']\\s*\\)')
    var matches = regex.search_all(line)
    
    for m in matches:
        deps.append(m.get_string(1))
    
    return deps

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

# ============================================
# Phase 3: Developer Experience Tools
# ============================================

# Get dependencies for a resource with circular reference detection
func get_dependencies(params):
    var resource_path = params.get("resource_path", "")
    var max_depth = params.get("max_depth", 10)
    var include_built_in = params.get("include_built_in", false)
    
    log_info("Getting dependencies" + (" for: " + resource_path if not resource_path.is_empty() else " for all resources"))
    
    var result = {
        "dependencies": {},
        "circular_references": [],
        "summary": {
            "total_resources": 0,
            "total_dependencies": 0,
            "circular_count": 0
        }
    }
    
    if not resource_path.is_empty():
        # Analyze single resource
        var full_path = resource_path
        if not full_path.begins_with("res://"):
            full_path = "res://" + full_path
        
        if not FileAccess.file_exists(full_path):
            log_error("Resource file does not exist: " + full_path)
            quit(1)
        
        var visited = {}
        var path_stack = []
        var deps = analyze_resource_dependencies(full_path, max_depth, 0, visited, path_stack, include_built_in, result)
        result["dependencies"][full_path] = deps
        result["summary"]["total_resources"] = 1
    else:
        # Analyze all project resources
        var resource_extensions = ["tscn", "tres", "gd", "gdshader", "shader"]
        var all_resources = []
        for ext in resource_extensions:
            all_resources.append_array(find_files("res://", "." + ext))
        
        for res_path in all_resources:
            var visited = {}
            var path_stack = []
            var deps = analyze_resource_dependencies(res_path, max_depth, 0, visited, path_stack, include_built_in, result)
            if deps.size() > 0:
                result["dependencies"][res_path] = deps
        
        result["summary"]["total_resources"] = all_resources.size()
    
    # Count total dependencies
    var dep_count = 0
    for key in result["dependencies"]:
        dep_count += count_dependencies_recursive(result["dependencies"][key])
    result["summary"]["total_dependencies"] = dep_count
    result["summary"]["circular_count"] = result["circular_references"].size()
    
    print(JSON.stringify(result))

# Helper to count dependencies recursively
func count_dependencies_recursive(deps: Array) -> int:
    var count = deps.size()
    for dep in deps:
        if dep is Dictionary and dep.has("dependencies"):
            count += count_dependencies_recursive(dep["dependencies"])
    return count

# Helper to analyze dependencies of a single resource
func analyze_resource_dependencies(path: String, max_depth: int, current_depth: int, visited: Dictionary, path_stack: Array, include_built_in: bool, result: Dictionary) -> Array:
    var deps = []
    
    if current_depth >= max_depth:
        return deps
    
    # Check for circular reference
    if path in path_stack:
        var cycle = path_stack.slice(path_stack.find(path))
        cycle.append(path)
        if not cycle in result["circular_references"]:
            result["circular_references"].append(cycle)
        return [{"path": path, "circular": true}]
    
    # Skip if already fully visited
    if visited.has(path):
        return visited[path]
    
    path_stack.append(path)
    
    # Parse the file to find dependencies
    var file = FileAccess.open(path, FileAccess.READ)
    if file:
        var content = file.get_as_text()
        file.close()
        
        # Find resource references
        var patterns = [
            "res://[^\"'\\s\\]\\)]+",  # res:// paths
            "preload\\(\"([^\"]+)\"\\)",  # preload
            "load\\(\"([^\"]+)\"\\)",  # load
            "ext_resource.*path=\"([^\"]+)\""  # external resources in tscn/tres
        ]
        
        var regex = RegEx.new()
        for pattern in patterns:
            regex.compile(pattern)
            var matches = regex.search_all(content)
            for m in matches:
                var dep_path = m.get_string()
                
                # Extract path from preload/load patterns
                if "preload" in dep_path or "load" in dep_path:
                    var inner_regex = RegEx.new()
                    inner_regex.compile("\"([^\"]+)\"")
                    var inner_match = inner_regex.search(dep_path)
                    if inner_match:
                        dep_path = inner_match.get_string(1)
                elif "ext_resource" in dep_path:
                    var inner_regex = RegEx.new()
                    inner_regex.compile("path=\"([^\"]+)\"")
                    var inner_match = inner_regex.search(dep_path)
                    if inner_match:
                        dep_path = inner_match.get_string(1)
                
                # Clean up path
                if not dep_path.begins_with("res://"):
                    continue
                
                # Skip built-in resources unless requested
                if not include_built_in and (dep_path.contains("addons/") or dep_path.begins_with("res://.")):
                    continue
                
                # Skip if same as source
                if dep_path == path:
                    continue
                
                var dep_info = {
                    "path": dep_path,
                    "exists": FileAccess.file_exists(dep_path)
                }
                
                # Recursively analyze if exists and not yet added
                if dep_info["exists"] and current_depth + 1 < max_depth:
                    var sub_deps = analyze_resource_dependencies(dep_path, max_depth, current_depth + 1, visited, path_stack, include_built_in, result)
                    if sub_deps.size() > 0:
                        dep_info["dependencies"] = sub_deps
                
                # Avoid duplicates
                var already_added = false
                for existing in deps:
                    if existing is Dictionary and existing.get("path", "") == dep_path:
                        already_added = true
                        break
                if not already_added:
                    deps.append(dep_info)
    
    path_stack.pop_back()
    visited[path] = deps
    return deps

# Find all usages of a resource across the project
func find_resource_usages(params):
    var resource_path = params.resource_path
    var search_patterns = params.get("search_patterns", [])
    var file_types = params.get("file_types", ["tscn", "tres", "gd", "gdshader"])
    
    if not resource_path.begins_with("res://"):
        resource_path = "res://" + resource_path
    
    log_info("Finding usages of: " + resource_path)
    
    var result = {
        "resource_path": resource_path,
        "usages": [],
        "summary": {
            "total_files_searched": 0,
            "files_with_usages": 0,
            "total_usages": 0
        }
    }
    
    # Build search patterns
    var patterns_to_search = [resource_path]
    if search_patterns.size() > 0:
        patterns_to_search.append_array(search_patterns)
    
    # Also search for relative variants
    var relative_path = resource_path.substr(6) if resource_path.begins_with("res://") else resource_path
    patterns_to_search.append(relative_path)
    
    # Get all searchable files
    var all_files = []
    for ext in file_types:
        all_files.append_array(find_files("res://", "." + ext))
    
    result["summary"]["total_files_searched"] = all_files.size()
    
    for file_path in all_files:
        # Skip the resource itself
        if file_path == resource_path:
            continue
        
        var file = FileAccess.open(file_path, FileAccess.READ)
        if not file:
            continue
        
        var content = file.get_as_text()
        file.close()
        
        var file_usages = []
        var lines = content.split("\n")
        
        for i in range(lines.size()):
            var line = lines[i]
            for pattern in patterns_to_search:
                if pattern in line:
                    file_usages.append({
                        "line_number": i + 1,
                        "line_content": line.strip_edges(),
                        "pattern_matched": pattern
                    })
                    break
        
        if file_usages.size() > 0:
            result["usages"].append({
                "file": file_path,
                "occurrences": file_usages
            })
            result["summary"]["files_with_usages"] += 1
            result["summary"]["total_usages"] += file_usages.size()
    
    print(JSON.stringify(result))

# Parse Godot error log and provide suggestions
func parse_error_log(params):
    var log_path = params.get("log_path", "")
    var log_content = params.get("log_content", "")
    var include_suggestions = params.get("include_suggestions", true)
    
    log_info("Parsing error log")
    
    var result = {
        "errors": [],
        "warnings": [],
        "summary": {
            "total_errors": 0,
            "total_warnings": 0,
            "error_categories": {}
        }
    }
    
    var content = ""
    
    if not log_path.is_empty():
        var file = FileAccess.open(log_path, FileAccess.READ)
        if file:
            content = file.get_as_text()
            file.close()
        else:
            log_error("Failed to open log file: " + log_path)
            quit(1)
    elif not log_content.is_empty():
        content = log_content
    else:
        # Try default Godot log location
        var default_paths = [
            "user://logs/godot.log",
            OS.get_user_data_dir() + "/logs/godot.log"
        ]
        for path in default_paths:
            var file = FileAccess.open(path, FileAccess.READ)
            if file:
                content = file.get_as_text()
                file.close()
                result["log_source"] = path
                break
    
    if content.is_empty():
        result["message"] = "No log content provided and default log file not found"
        print(JSON.stringify(result))
        return
    
    # Error patterns to detect
    var error_patterns = {
        "script_error": {
            "pattern": "SCRIPT ERROR:",
            "category": "Script",
            "suggestion": "Check the script file at the mentioned line for syntax or logic errors"
        },
        "parse_error": {
            "pattern": "Parse Error:",
            "category": "Syntax",
            "suggestion": "Review the syntax at the mentioned location, check for typos or missing punctuation"
        },
        "null_reference": {
            "pattern": "Attempt to call function.*on a null instance",
            "category": "Null Reference",
            "suggestion": "Ensure the object is properly initialized before calling methods on it"
        },
        "invalid_call": {
            "pattern": "Invalid call.*Nonexistent function",
            "category": "Invalid Call",
            "suggestion": "Check if the function exists and is spelled correctly"
        },
        "type_error": {
            "pattern": "Cannot convert.*to.*",
            "category": "Type Error",
            "suggestion": "Ensure you're using compatible types or add explicit type conversion"
        },
        "resource_not_found": {
            "pattern": "res://.*not found",
            "category": "Missing Resource",
            "suggestion": "Verify the resource path is correct and the file exists"
        },
        "cyclic_reference": {
            "pattern": "Cyclic reference",
            "category": "Cyclic Reference",
            "suggestion": "Break the circular dependency between resources"
        }
    }
    
    var lines = content.split("\n")
    
    for i in range(lines.size()):
        var line = lines[i]
        var line_lower = line.to_lower()
        
        # Check for errors
        if "error" in line_lower or "failed" in line_lower:
            var error_entry = {
                "line_number": i + 1,
                "message": line.strip_edges(),
                "category": "General"
            }
            
            # Match specific error patterns
            for pattern_name in error_patterns:
                var pattern_info = error_patterns[pattern_name]
                if pattern_info["pattern"].to_lower() in line_lower:
                    error_entry["category"] = pattern_info["category"]
                    if include_suggestions:
                        error_entry["suggestion"] = pattern_info["suggestion"]
                    break
            
            result["errors"].append(error_entry)
            
            # Count by category
            if not result["summary"]["error_categories"].has(error_entry["category"]):
                result["summary"]["error_categories"][error_entry["category"]] = 0
            result["summary"]["error_categories"][error_entry["category"]] += 1
        
        # Check for warnings
        elif "warning" in line_lower:
            result["warnings"].append({
                "line_number": i + 1,
                "message": line.strip_edges()
            })
    
    result["summary"]["total_errors"] = result["errors"].size()
    result["summary"]["total_warnings"] = result["warnings"].size()
    
    print(JSON.stringify(result))

# Get comprehensive project health check with scoring
func get_project_health(params):
    var include_details = params.get("include_details", true)
    var check_categories = params.get("categories", ["structure", "resources", "scripts", "scenes", "config"])
    
    log_info("Performing project health check")
    
    var result = {
        "score": 100,
        "grade": "A",
        "checks": {},
        "issues": [],
        "recommendations": []
    }
    
    var deductions = 0
    
    # 1. Project Structure Check
    if "structure" in check_categories:
        var structure_check = {
            "name": "Project Structure",
            "passed": true,
            "details": []
        }
        
        # Check for project.godot
        if not FileAccess.file_exists("res://project.godot"):
            structure_check["passed"] = false
            structure_check["details"].append("Missing project.godot file")
            deductions += 30
        
        # Check for common directories
        var recommended_dirs = ["res://scenes", "res://scripts", "res://assets"]
        var missing_dirs = []
        for dir in recommended_dirs:
            if not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(dir)):
                missing_dirs.append(dir)
        
        if missing_dirs.size() > 0:
            structure_check["details"].append("Consider organizing with directories: " + ", ".join(missing_dirs))
            deductions += 2 * missing_dirs.size()
        
        result["checks"]["structure"] = structure_check
    
    # 2. Resource Check
    if "resources" in check_categories:
        var resource_check = {
            "name": "Resources",
            "passed": true,
            "details": []
        }
        
        # Check for orphaned imports
        var importable_extensions = ["png", "jpg", "wav", "mp3", "ogg"]
        var resources = []
        for ext in importable_extensions:
            resources.append_array(find_files("res://", "." + ext))
        
        var missing_imports = 0
        for res in resources:
            var import_file = res + ".import"
            if not FileAccess.file_exists(import_file):
                missing_imports += 1
        
        if missing_imports > 0:
            resource_check["details"].append(str(missing_imports) + " resources may need reimporting")
            deductions += missing_imports
        
        resource_check["total_resources"] = resources.size()
        result["checks"]["resources"] = resource_check
    
    # 3. Scripts Check
    if "scripts" in check_categories:
        var scripts_check = {
            "name": "Scripts",
            "passed": true,
            "details": []
        }
        
        var script_files = find_files("res://", ".gd")
        var issues_found = 0
        var todo_count = 0
        var empty_functions = 0
        
        for script_path in script_files:
            var file = FileAccess.open(script_path, FileAccess.READ)
            if file:
                var content = file.get_as_text()
                file.close()
                
                if "# TODO" in content or "# FIXME" in content:
                    todo_count += 1
                if "pass # " in content or content.ends_with("pass\n"):
                    empty_functions += 1
        
        if todo_count > 0:
            scripts_check["details"].append(str(todo_count) + " scripts have TODO/FIXME comments")
            deductions += todo_count
        
        if empty_functions > 0:
            scripts_check["details"].append(str(empty_functions) + " scripts may have empty functions")
            deductions += empty_functions
        
        scripts_check["total_scripts"] = script_files.size()
        result["checks"]["scripts"] = scripts_check
    
    # 4. Scenes Check
    if "scenes" in check_categories:
        var scenes_check = {
            "name": "Scenes",
            "passed": true,
            "details": []
        }
        
        var scene_files = find_files("res://", ".tscn")
        scenes_check["total_scenes"] = scene_files.size()
        
        if scene_files.size() == 0:
            scenes_check["details"].append("No scene files found in project")
            deductions += 5
        
        result["checks"]["scenes"] = scenes_check
    
    # 5. Configuration Check
    if "config" in check_categories:
        var config_check = {
            "name": "Configuration",
            "passed": true,
            "details": []
        }
        
        # Check main scene
        var main_scene = ProjectSettings.get_setting("application/run/main_scene", "")
        if main_scene.is_empty():
            config_check["details"].append("No main scene configured")
            deductions += 10
        elif not FileAccess.file_exists(main_scene):
            config_check["details"].append("Main scene file does not exist: " + main_scene)
            deductions += 15
        
        # Check project name
        var project_name = ProjectSettings.get_setting("application/config/name", "")
        if project_name.is_empty():
            config_check["details"].append("No project name set")
            deductions += 2
        
        # Check for export presets
        if not FileAccess.file_exists("res://export_presets.cfg"):
            config_check["details"].append("No export presets configured")
            deductions += 3
        
        result["checks"]["config"] = config_check
    
    # Calculate final score
    result["score"] = max(0, 100 - deductions)
    
    # Determine grade
    if result["score"] >= 90:
        result["grade"] = "A"
    elif result["score"] >= 80:
        result["grade"] = "B"
    elif result["score"] >= 70:
        result["grade"] = "C"
    elif result["score"] >= 60:
        result["grade"] = "D"
    else:
        result["grade"] = "F"
    
    # Generate recommendations based on issues
    if deductions > 0:
        if result["score"] < 70:
            result["recommendations"].append("Address critical issues to improve project stability")
        if not FileAccess.file_exists("res://export_presets.cfg"):
            result["recommendations"].append("Configure export presets for your target platforms")
    
    print(JSON.stringify(result))

# ============================================
# Phase 3: Configuration Management Tools
# ============================================

# Get a project setting value
func get_project_setting(params):
    var setting_path = params.setting
    var include_metadata = params.get("include_metadata", false)
    
    log_info("Getting project setting: " + setting_path)
    
    var result = {
        "setting_path": setting_path,
        "exists": ProjectSettings.has_setting(setting_path)
    }
    
    if result["exists"]:
        var value = ProjectSettings.get_setting(setting_path)
        result["value"] = serialize_value(value)
        
        if include_metadata:
            result["type"] = typeof(value)
            result["type_name"] = type_string(typeof(value))
    else:
        result["value"] = null
        result["message"] = "Setting does not exist"
    
    print(JSON.stringify(result))

# Set a project setting value
func set_project_setting(params):
    var setting_path = params.setting
    var value = params.value
    var save_immediately = params.get("save", true)
    
    log_info("Setting project setting: " + setting_path)
    
    var old_value = null
    var had_value = ProjectSettings.has_setting(setting_path)
    if had_value:
        old_value = ProjectSettings.get_setting(setting_path)
    
    # Deserialize value if needed
    var final_value = deserialize_value(value)
    
    ProjectSettings.set_setting(setting_path, final_value)
    
    var result = {
        "setting_path": setting_path,
        "old_value": serialize_value(old_value) if had_value else null,
        "new_value": serialize_value(final_value),
        "was_new": not had_value
    }
    
    if save_immediately:
        var err = ProjectSettings.save()
        result["saved"] = err == OK
        if err != OK:
            result["save_error"] = str(err)
    
    print(JSON.stringify(result))

# Add an autoload singleton
func add_autoload(params):
    var name = params.name
    var path = params.path
    var enabled = params.get("enabled", true)
    
    if not path.begins_with("res://"):
        path = "res://" + path
    
    log_info("Adding autoload: " + name + " -> " + path)
    
    # Verify the script/scene exists
    if not FileAccess.file_exists(path):
        log_error("Autoload file does not exist: " + path)
        quit(1)
    
    # Read project.godot file
    var config = ConfigFile.new()
    var err = config.load("res://project.godot")
    if err != OK:
        log_error("Failed to load project.godot: " + str(err))
        quit(1)
    
    # Check if autoload already exists
    var existing_autoloads = []
    if config.has_section("autoload"):
        for key in config.get_section_keys("autoload"):
            existing_autoloads.append(key)
    
    var was_updated = name in existing_autoloads
    
    # Format: "*res://path/to/script.gd" (asterisk means enabled)
    var autoload_value = ("*" if enabled else "") + path
    config.set_value("autoload", name, autoload_value)
    
    err = config.save("res://project.godot")
    if err != OK:
        log_error("Failed to save project.godot: " + str(err))
        quit(1)
    
    var result = {
        "name": name,
        "path": path,
        "enabled": enabled,
        "action": "updated" if was_updated else "added"
    }
    
    print(JSON.stringify(result))

# Remove an autoload singleton
func remove_autoload(params):
    var name = params.name
    
    log_info("Removing autoload: " + name)
    
    # Read project.godot file
    var config = ConfigFile.new()
    var err = config.load("res://project.godot")
    if err != OK:
        log_error("Failed to load project.godot: " + str(err))
        quit(1)
    
    var existed = false
    var old_value = ""
    
    if config.has_section("autoload"):
        if config.has_section_key("autoload", name):
            existed = true
            old_value = config.get_value("autoload", name, "")
            config.erase_section_key("autoload", name)
    
    if not existed:
        log_error("Autoload not found: " + name)
        quit(1)
    
    err = config.save("res://project.godot")
    if err != OK:
        log_error("Failed to save project.godot: " + str(err))
        quit(1)
    
    var result = {
        "name": name,
        "removed": true,
        "old_path": old_value.trim_prefix("*")
    }
    
    print(JSON.stringify(result))

# List all autoload singletons
func list_autoloads(params):
    var include_status = params.get("include_status", true)
    
    log_info("Listing autoloads")
    
    # Read project.godot file
    var config = ConfigFile.new()
    var err = config.load("res://project.godot")
    if err != OK:
        log_error("Failed to load project.godot: " + str(err))
        quit(1)
    
    var autoloads = []
    
    if config.has_section("autoload"):
        for key in config.get_section_keys("autoload"):
            var value = config.get_value("autoload", key, "")
            var enabled = value.begins_with("*")
            var path = value.trim_prefix("*")
            
            var autoload_info = {
                "name": key,
                "path": path,
                "enabled": enabled
            }
            
            if include_status:
                autoload_info["file_exists"] = FileAccess.file_exists(path)
            
            autoloads.append(autoload_info)
    
    var result = {
        "autoloads": autoloads,
        "count": autoloads.size()
    }
    
    print(JSON.stringify(result))

# Set the main scene
func set_main_scene(params):
    var scene_path = params.scene_path
    
    if not scene_path.begins_with("res://"):
        scene_path = "res://" + scene_path
    
    log_info("Setting main scene: " + scene_path)
    
    # Verify the scene exists
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    var old_main_scene = ProjectSettings.get_setting("application/run/main_scene", "")
    
    ProjectSettings.set_setting("application/run/main_scene", scene_path)
    var err = ProjectSettings.save()
    
    if err != OK:
        log_error("Failed to save project settings: " + str(err))
        quit(1)
    
    var result = {
        "old_main_scene": old_main_scene,
        "new_main_scene": scene_path,
        "saved": true
    }
    
    print(JSON.stringify(result))

# ============================================
# Phase 2: Import/Export Pipeline (V3 Enhancement)
# ============================================

# Get import status for resources
func get_import_status(params):
    var resource_path = params.get("resource_path", "")
    var include_up_to_date = params.get("include_up_to_date", false)
    
    log_info("Getting import status" + (" for: " + resource_path if not resource_path.is_empty() else " for all resources"))
    
    var result = {
        "resources": [],
        "summary": {
            "total": 0,
            "needs_reimport": 0,
            "up_to_date": 0,
            "missing_source": 0
        }
    }
    
    # Get the .godot/imported directory
    var import_dir = "res://.godot/imported/"
    
    if not resource_path.is_empty():
        # Check specific resource
        var full_path = resource_path
        if not full_path.begins_with("res://"):
            full_path = "res://" + full_path
        
        var import_file = full_path + ".import"
        var status = check_resource_import_status(full_path, import_file)
        result["resources"].append(status)
        result["summary"]["total"] = 1
        if status["status"] == "needs_reimport":
            result["summary"]["needs_reimport"] = 1
        elif status["status"] == "up_to_date":
            result["summary"]["up_to_date"] = 1
        elif status["status"] == "missing_source":
            result["summary"]["missing_source"] = 1
    else:
        # Scan all importable resources
        var importable_extensions = ["png", "jpg", "jpeg", "webp", "svg", "wav", "mp3", "ogg", "ttf", "otf", "glb", "gltf", "fbx", "obj"]
        var resources = find_files_with_extensions("res://", importable_extensions)
        
        for res_path in resources:
            var import_file = res_path + ".import"
            var status = check_resource_import_status(res_path, import_file)
            
            if include_up_to_date or status["status"] != "up_to_date":
                result["resources"].append(status)
            
            result["summary"]["total"] += 1
            if status["status"] == "needs_reimport":
                result["summary"]["needs_reimport"] += 1
            elif status["status"] == "up_to_date":
                result["summary"]["up_to_date"] += 1
            elif status["status"] == "missing_source":
                result["summary"]["missing_source"] += 1
    
    print(JSON.stringify(result))

# Helper to check import status of a single resource
func check_resource_import_status(resource_path: String, import_file_path: String) -> Dictionary:
    var status = {
        "path": resource_path,
        "status": "unknown",
        "import_file_exists": false,
        "source_exists": false
    }
    
    # Check if source file exists
    status["source_exists"] = FileAccess.file_exists(resource_path)
    if not status["source_exists"]:
        status["status"] = "missing_source"
        return status
    
    # Check if .import file exists
    status["import_file_exists"] = FileAccess.file_exists(import_file_path)
    if not status["import_file_exists"]:
        status["status"] = "needs_reimport"
        return status
    
    # Compare modification times
    var source_modified = FileAccess.get_modified_time(resource_path)
    var import_modified = FileAccess.get_modified_time(import_file_path)
    
    if source_modified > import_modified:
        status["status"] = "needs_reimport"
    else:
        status["status"] = "up_to_date"
    
    return status

# Helper to find files with specific extensions
func find_files_with_extensions(path: String, extensions: Array) -> Array:
    var files = []
    var dir = DirAccess.open(path)
    
    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()
        
        while file_name != "":
            if file_name.begins_with("."):
                file_name = dir.get_next()
                continue
            
            var full_path = path + file_name
            if dir.current_is_dir():
                files.append_array(find_files_with_extensions(full_path + "/", extensions))
            else:
                var ext = file_name.get_extension().to_lower()
                if ext in extensions:
                    files.append(full_path)
            
            file_name = dir.get_next()
        
        dir.list_dir_end()
    
    return files

# Get import options for a resource
func get_import_options(params):
    var resource_path = params.resource_path
    if not resource_path.begins_with("res://"):
        resource_path = "res://" + resource_path
    
    log_info("Getting import options for: " + resource_path)
    
    var import_file_path = resource_path + ".import"
    
    if not FileAccess.file_exists(import_file_path):
        log_error("Import file does not exist: " + import_file_path)
        log_error("This resource may not have been imported yet")
        quit(1)
    
    # Parse the .import file
    var config = ConfigFile.new()
    var err = config.load(import_file_path)
    
    if err != OK:
        log_error("Failed to parse import file: " + str(err))
        quit(1)
    
    var result = {
        "resource_path": resource_path,
        "import_file": import_file_path,
        "remap": {},
        "deps": {},
        "params": {}
    }
    
    # Get remap section
    if config.has_section("remap"):
        for key in config.get_section_keys("remap"):
            result["remap"][key] = config.get_value("remap", key)
    
    # Get deps section
    if config.has_section("deps"):
        for key in config.get_section_keys("deps"):
            result["deps"][key] = config.get_value("deps", key)
    
    # Get params section
    if config.has_section("params"):
        for key in config.get_section_keys("params"):
            result["params"][key] = config.get_value("params", key)
    
    print(JSON.stringify(result))

# Set import options for a resource
func set_import_options(params):
    var resource_path = params.resource_path
    if not resource_path.begins_with("res://"):
        resource_path = "res://" + resource_path
    
    var options = params.options
    var do_reimport = params.get("reimport", true)
    
    log_info("Setting import options for: " + resource_path)
    
    var import_file_path = resource_path + ".import"
    
    if not FileAccess.file_exists(import_file_path):
        log_error("Import file does not exist: " + import_file_path)
        log_error("This resource may not have been imported yet")
        quit(1)
    
    # Parse existing .import file
    var config = ConfigFile.new()
    var err = config.load(import_file_path)
    
    if err != OK:
        log_error("Failed to parse import file: " + str(err))
        quit(1)
    
    # Update options in params section
    var updated_keys = []
    for key in options:
        config.set_value("params", key, options[key])
        updated_keys.append(key)
        if debug_mode:
            log_debug("Set " + key + " = " + str(options[key]))
    
    # Save the updated config
    err = config.save(import_file_path)
    if err != OK:
        log_error("Failed to save import file: " + str(err))
        quit(1)
    
    var result = {
        "resource_path": resource_path,
        "updated_options": updated_keys,
        "reimport_triggered": do_reimport
    }
    
    # Note: Actual reimport would require editor reimport functionality
    # In headless mode, we can only update the .import file
    if do_reimport:
        result["note"] = "Import file updated. Run the editor or use 'reimport_resource' to apply changes."
    
    print(JSON.stringify(result))

# Reimport a resource or all resources
func reimport_resource(params):
    var resource_path = params.get("resource_path", "")
    var force = params.get("force", false)
    
    log_info("Reimporting" + (" resource: " + resource_path if not resource_path.is_empty() else " all modified resources"))
    
    # Note: Full reimport requires editor functionality
    # In headless mode, we can trigger a project rescan
    var result = {
        "status": "requested",
        "resource_path": resource_path if not resource_path.is_empty() else "all",
        "force": force,
        "note": "Reimport in headless mode is limited. For full reimport, open the project in the editor."
    }
    
    # We can at least verify the resource exists and check its status
    if not resource_path.is_empty():
        var full_path = resource_path
        if not full_path.begins_with("res://"):
            full_path = "res://" + full_path
        
        if not FileAccess.file_exists(full_path):
            log_error("Resource file does not exist: " + full_path)
            quit(1)
        
        var import_file = full_path + ".import"
        var status = check_resource_import_status(full_path, import_file)
        result["current_status"] = status["status"]
    
    print(JSON.stringify(result))

# List export presets
func list_export_presets(params):
    var include_template_status = params.get("include_template_status", true)
    
    log_info("Listing export presets")
    
    var presets_file = "res://export_presets.cfg"
    
    var result = {
        "presets": [],
        "presets_file_exists": FileAccess.file_exists(presets_file)
    }
    
    if not result["presets_file_exists"]:
        result["note"] = "No export_presets.cfg found. Configure export presets in the Godot editor."
        print(JSON.stringify(result))
        return
    
    # Parse export_presets.cfg
    var config = ConfigFile.new()
    var err = config.load(presets_file)
    
    if err != OK:
        log_error("Failed to parse export_presets.cfg: " + str(err))
        quit(1)
    
    # Export presets are stored as [preset.0], [preset.1], etc.
    var preset_idx = 0
    while config.has_section("preset." + str(preset_idx)):
        var section = "preset." + str(preset_idx)
        var preset = {
            "index": preset_idx,
            "name": config.get_value(section, "name", "Unknown"),
            "platform": config.get_value(section, "platform", "Unknown"),
            "runnable": config.get_value(section, "runnable", false),
            "export_path": config.get_value(section, "export_path", ""),
            "export_filter": config.get_value(section, "export_filter", "all_resources"),
            "include_filter": config.get_value(section, "include_filter", ""),
            "exclude_filter": config.get_value(section, "exclude_filter", "")
        }
        
        # Get custom features if present
        if config.has_section_key(section, "custom_features"):
            preset["custom_features"] = config.get_value(section, "custom_features", "")
        
        # Note: Template status requires runtime check which is limited in headless mode
        if include_template_status:
            preset["template_status"] = "unknown (headless mode)"
        
        result["presets"].append(preset)
        preset_idx += 1
    
    result["total_presets"] = preset_idx
    print(JSON.stringify(result))

# Validate project for export
func validate_project(params):
    var preset_name = params.get("preset", "")
    var include_suggestions = params.get("include_suggestions", true)
    
    log_info("Validating project" + (" for preset: " + preset_name if not preset_name.is_empty() else ""))
    
    var result = {
        "valid": true,
        "issues": [],
        "warnings": [],
        "checks_performed": []
    }
    
    # Check 1: project.godot exists
    result["checks_performed"].append("project_file")
    if not FileAccess.file_exists("res://project.godot"):
        result["valid"] = false
        var issue = {"type": "error", "check": "project_file", "message": "project.godot not found"}
        if include_suggestions:
            issue["suggestion"] = "Ensure you are running this from a valid Godot project directory"
        result["issues"].append(issue)
    
    # Check 2: Main scene is set
    result["checks_performed"].append("main_scene")
    var main_scene = ProjectSettings.get_setting("application/run/main_scene", "")
    if main_scene.is_empty():
        result["valid"] = false
        var issue = {"type": "error", "check": "main_scene", "message": "No main scene set"}
        if include_suggestions:
            issue["suggestion"] = "Set a main scene in Project Settings > Application > Run > Main Scene"
        result["issues"].append(issue)
    elif not FileAccess.file_exists(main_scene):
        result["valid"] = false
        var issue = {"type": "error", "check": "main_scene", "message": "Main scene file does not exist: " + main_scene}
        if include_suggestions:
            issue["suggestion"] = "Update the main scene setting or create the missing scene file"
        result["issues"].append(issue)
    
    # Check 3: Export presets exist
    result["checks_performed"].append("export_presets")
    if not FileAccess.file_exists("res://export_presets.cfg"):
        var warning = {"type": "warning", "check": "export_presets", "message": "No export presets configured"}
        if include_suggestions:
            warning["suggestion"] = "Configure export presets in Godot editor: Project > Export"
        result["warnings"].append(warning)
    
    # Check 4: Icon is set
    result["checks_performed"].append("icon")
    var icon_path = ProjectSettings.get_setting("application/config/icon", "")
    if icon_path.is_empty():
        var warning = {"type": "warning", "check": "icon", "message": "No application icon set"}
        if include_suggestions:
            warning["suggestion"] = "Set an icon in Project Settings > Application > Config > Icon"
        result["warnings"].append(warning)
    elif not FileAccess.file_exists(icon_path):
        var warning = {"type": "warning", "check": "icon", "message": "Icon file does not exist: " + icon_path}
        if include_suggestions:
            warning["suggestion"] = "Update the icon path or add the missing icon file"
        result["warnings"].append(warning)
    
    # Check 5: Project name is set
    result["checks_performed"].append("project_name")
    var project_name = ProjectSettings.get_setting("application/config/name", "")
    if project_name.is_empty():
        var warning = {"type": "warning", "check": "project_name", "message": "No project name set"}
        if include_suggestions:
            warning["suggestion"] = "Set a project name in Project Settings > Application > Config > Name"
        result["warnings"].append(warning)
    
    # Check 6: Look for common issues in scripts (basic check)
    result["checks_performed"].append("scripts")
    var script_files = find_files_with_extensions("res://", ["gd"])
    var scripts_checked = 0
    var script_issues = []
    
    for script_path in script_files:
        scripts_checked += 1
        if scripts_checked > 100:  # Limit to prevent long execution
            break
        
        var file = FileAccess.open(script_path, FileAccess.READ)
        if file:
            var content = file.get_as_text()
            file.close()
            
            # Check for common issues
            if "# TODO" in content or "# FIXME" in content:
                script_issues.append({"path": script_path, "issue": "Contains TODO/FIXME comments"})
            if "pass # TODO" in content:
                script_issues.append({"path": script_path, "issue": "Contains unimplemented functions"})
    
    if script_issues.size() > 0:
        var warning = {"type": "warning", "check": "scripts", "message": str(script_issues.size()) + " script issues found", "details": script_issues.slice(0, 5)}
        if include_suggestions:
            warning["suggestion"] = "Review and resolve TODO/FIXME items before release"
        result["warnings"].append(warning)
    
    result["scripts_checked"] = scripts_checked
    result["issue_count"] = result["issues"].size()
    result["warning_count"] = result["warnings"].size()
    
    print(JSON.stringify(result))

# ============================================
# Phase 1: Scene Operations (V3 Enhancement)
# ============================================

# Helper function to normalize scene path for Phase 1 operations
func normalize_scene_path_v2(path: String) -> String:
    if not path.begins_with("res://"):
        return "res://" + path
    return path

# Helper function to get node from scene root by path for Phase 1 operations
func get_node_by_path_v2(scene_root: Node, node_path: String) -> Node:
    if node_path == "root" or node_path == "":
        return scene_root
    
    # Remove "root/" prefix if present
    var clean_path = node_path
    if clean_path.begins_with("root/"):
        clean_path = clean_path.substr(5)
    elif clean_path.begins_with("root"):
        clean_path = clean_path.substr(4)
        if clean_path.begins_with("/"):
            clean_path = clean_path.substr(1)
    
    if clean_path.is_empty():
        return scene_root
    
    return scene_root.get_node_or_null(clean_path)

# Helper function to build node tree structure recursively
func build_node_tree(node: Node, current_depth: int, max_depth: int, include_properties: bool) -> Dictionary:
    var result = {
        "name": node.name,
        "type": node.get_class(),
        "path": str(node.get_path()) if node.is_inside_tree() else node.name
    }
    
    if include_properties:
        result["properties"] = get_non_default_properties(node)
    
    # Add children if within depth limit
    if max_depth == -1 or current_depth < max_depth:
        var children = []
        for child in node.get_children():
            children.append(build_node_tree(child, current_depth + 1, max_depth, include_properties))
        if children.size() > 0:
            result["children"] = children
    
    return result

# Helper function to get non-default properties of a node
func get_non_default_properties(node: Node) -> Dictionary:
    var props = {}
    var property_list = node.get_property_list()
    
    for prop in property_list:
        var prop_name = prop["name"]
        var prop_usage = prop["usage"]
        
        # Skip internal properties and script/metadata
        if prop_usage & PROPERTY_USAGE_STORAGE == 0:
            continue
        if prop_name.begins_with("_") or prop_name == "script" or prop_name == "metadata":
            continue
        
        var value = node.get(prop_name)
        
        # Convert complex types to serializable format
        props[prop_name] = serialize_value(value)
    
    return props

# Helper function to serialize Godot values to JSON-compatible format
func serialize_value(value) -> Variant:
    if value == null:
        return null
    elif value is Vector2:
        return {"x": value.x, "y": value.y, "_type": "Vector2"}
    elif value is Vector3:
        return {"x": value.x, "y": value.y, "z": value.z, "_type": "Vector3"}
    elif value is Vector2i:
        return {"x": value.x, "y": value.y, "_type": "Vector2i"}
    elif value is Vector3i:
        return {"x": value.x, "y": value.y, "z": value.z, "_type": "Vector3i"}
    elif value is Color:
        return {"r": value.r, "g": value.g, "b": value.b, "a": value.a, "_type": "Color"}
    elif value is Rect2:
        return {"position": serialize_value(value.position), "size": serialize_value(value.size), "_type": "Rect2"}
    elif value is Transform2D:
        return {"origin": serialize_value(value.origin), "x": serialize_value(value.x), "y": serialize_value(value.y), "_type": "Transform2D"}
    elif value is Transform3D:
        return {"origin": serialize_value(value.origin), "basis": {"x": serialize_value(value.basis.x), "y": serialize_value(value.basis.y), "z": serialize_value(value.basis.z)}, "_type": "Transform3D"}
    elif value is NodePath:
        return {"path": str(value), "_type": "NodePath"}
    elif value is Resource:
        if value.resource_path.is_empty():
            return {"_type": "Resource", "class": value.get_class()}
        return {"path": value.resource_path, "_type": "Resource", "class": value.get_class()}
    elif value is Array:
        var arr = []
        for item in value:
            arr.append(serialize_value(item))
        return arr
    elif value is Dictionary:
        var dict = {}
        for key in value:
            dict[str(key)] = serialize_value(value[key])
        return dict
    elif value is Object:
        return {"_type": "Object", "class": value.get_class()}
    else:
        return value

# Helper function to deserialize JSON values back to Godot types
func deserialize_value(value) -> Variant:
    if value == null:
        return null
    elif value is Dictionary:
        if value.has("_type"):
            var type_name = value["_type"]
            match type_name:
                "Vector2":
                    return Vector2(value.get("x", 0), value.get("y", 0))
                "Vector3":
                    return Vector3(value.get("x", 0), value.get("y", 0), value.get("z", 0))
                "Vector2i":
                    return Vector2i(value.get("x", 0), value.get("y", 0))
                "Vector3i":
                    return Vector3i(value.get("x", 0), value.get("y", 0), value.get("z", 0))
                "Color":
                    return Color(value.get("r", 0), value.get("g", 0), value.get("b", 0), value.get("a", 1))
                "Rect2":
                    var pos = deserialize_value(value.get("position", {}))
                    var size = deserialize_value(value.get("size", {}))
                    return Rect2(pos, size)
                "NodePath":
                    return NodePath(value.get("path", ""))
                _:
                    return value
        else:
            var dict = {}
            for key in value:
                dict[key] = deserialize_value(value[key])
            return dict
    elif value is Array:
        var arr = []
        for item in value:
            arr.append(deserialize_value(item))
        return arr
    else:
        return value

# List all nodes in a scene with their hierarchy
func list_scene_nodes(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    log_info("Listing nodes in scene: " + scene_path)
    
    if debug_mode:
        log_debug("Scene path (with res://): " + scene_path)
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    if debug_mode:
        log_debug("Scene loaded and instantiated successfully")
    
    var max_depth = params.get("depth", -1)
    var include_properties = params.get("include_properties", false)
    
    if debug_mode:
        log_debug("Max depth: " + str(max_depth))
        log_debug("Include properties: " + str(include_properties))
    
    var tree = build_node_tree(scene_root, 0, max_depth, include_properties)
    
    var result = {
        "scene_path": params.scene_path,
        "root": tree
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# Get all properties of a specific node
func get_node_properties(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var node_path = params.node_path
    log_info("Getting properties for node: " + node_path + " in scene: " + scene_path)
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    var target_node = get_node_by_path_v2(scene_root, node_path)
    if not target_node:
        log_error("Node not found: " + node_path)
        scene_root.queue_free()
        quit(1)
    
    if debug_mode:
        log_debug("Found node: " + target_node.name + " of type: " + target_node.get_class())
    
    var include_defaults = params.get("include_defaults", false)
    
    var props = {}
    var property_list = target_node.get_property_list()
    
    for prop in property_list:
        var prop_name = prop["name"]
        var prop_usage = prop["usage"]
        
        if not include_defaults:
            if prop_usage & PROPERTY_USAGE_STORAGE == 0:
                continue
        
        if prop_name.begins_with("_") or prop_name == "script":
            continue
        
        var value = target_node.get(prop_name)
        props[prop_name] = serialize_value(value)
    
    var result = {
        "scene_path": params.scene_path,
        "node_path": node_path,
        "node_name": target_node.name,
        "node_type": target_node.get_class(),
        "properties": props
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# Set properties on a node
func set_node_properties(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var node_path = params.node_path
    var properties = params.properties
    var save_scene_after = params.get("save_scene", true)
    
    log_info("Setting properties on node: " + node_path + " in scene: " + scene_path)
    
    if debug_mode:
        log_debug("Properties to set: " + JSON.stringify(properties))
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    var target_node = get_node_by_path_v2(scene_root, node_path)
    if not target_node:
        log_error("Node not found: " + node_path)
        scene_root.queue_free()
        quit(1)
    
    if debug_mode:
        log_debug("Found node: " + target_node.name + " of type: " + target_node.get_class())
    
    var set_count = 0
    var failed_props = []
    
    for prop_name in properties:
        var raw_value = properties[prop_name]
        var value = deserialize_value(raw_value)
        
        if debug_mode:
            log_debug("Setting property: " + prop_name + " = " + str(value))
        
        target_node.set(prop_name, value)
        set_count += 1
    
    if save_scene_after:
        var packed_scene = PackedScene.new()
        var pack_result = packed_scene.pack(scene_root)
        
        if pack_result == OK:
            var save_error = ResourceSaver.save(packed_scene, scene_path)
            if save_error != OK:
                log_error("Failed to save scene: " + str(save_error))
                scene_root.queue_free()
                quit(1)
            if debug_mode:
                log_debug("Scene saved successfully")
        else:
            log_error("Failed to pack scene: " + str(pack_result))
            scene_root.queue_free()
            quit(1)
    
    var result = {
        "scene_path": params.scene_path,
        "node_path": node_path,
        "properties_set": set_count,
        "failed_properties": failed_props,
        "scene_saved": save_scene_after
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# Delete a node from a scene
func delete_node(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var node_path = params.node_path
    var save_scene_after = params.get("save_scene", true)
    
    log_info("Deleting node: " + node_path + " from scene: " + scene_path)
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    if node_path == "root" or node_path == "" or node_path == "res://":
        log_error("Cannot delete the root node")
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    var target_node = get_node_by_path_v2(scene_root, node_path)
    if not target_node:
        log_error("Node not found: " + node_path)
        scene_root.queue_free()
        quit(1)
    
    if target_node == scene_root:
        log_error("Cannot delete the root node")
        scene_root.queue_free()
        quit(1)
    
    var deleted_name = target_node.name
    var deleted_type = target_node.get_class()
    var parent_name = target_node.get_parent().name if target_node.get_parent() else "none"
    
    if debug_mode:
        log_debug("Deleting node: " + deleted_name + " of type: " + deleted_type)
    
    target_node.get_parent().remove_child(target_node)
    target_node.queue_free()
    
    if save_scene_after:
        var packed_scene = PackedScene.new()
        var pack_result = packed_scene.pack(scene_root)
        
        if pack_result == OK:
            var save_error = ResourceSaver.save(packed_scene, scene_path)
            if save_error != OK:
                log_error("Failed to save scene: " + str(save_error))
                scene_root.queue_free()
                quit(1)
            if debug_mode:
                log_debug("Scene saved successfully")
        else:
            log_error("Failed to pack scene: " + str(pack_result))
            scene_root.queue_free()
            quit(1)
    
    var result = {
        "scene_path": params.scene_path,
        "deleted_node": {
            "name": deleted_name,
            "type": deleted_type,
            "parent": parent_name
        },
        "scene_saved": save_scene_after
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# Duplicate a node within a scene
func duplicate_node(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var node_path = params.node_path
    var new_name = params.new_name
    var parent_path = params.get("parent_path", "")
    var save_scene_after = params.get("save_scene", true)
    
    log_info("Duplicating node: " + node_path + " as: " + new_name + " in scene: " + scene_path)
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    var source_node = get_node_by_path_v2(scene_root, node_path)
    if not source_node:
        log_error("Source node not found: " + node_path)
        scene_root.queue_free()
        quit(1)
    
    if debug_mode:
        log_debug("Found source node: " + source_node.name + " of type: " + source_node.get_class())
    
    var target_parent: Node
    if parent_path.is_empty():
        target_parent = source_node.get_parent()
        if not target_parent:
            target_parent = scene_root
    else:
        target_parent = get_node_by_path_v2(scene_root, parent_path)
        if not target_parent:
            log_error("Parent node not found: " + parent_path)
            scene_root.queue_free()
            quit(1)
    
    if debug_mode:
        log_debug("Target parent: " + target_parent.name)
    
    var duplicate = source_node.duplicate()
    duplicate.name = new_name
    
    target_parent.add_child(duplicate)
    duplicate.owner = scene_root
    
    set_owner_recursive(duplicate, scene_root)
    
    if debug_mode:
        log_debug("Node duplicated successfully")
    
    if save_scene_after:
        var packed_scene = PackedScene.new()
        var pack_result = packed_scene.pack(scene_root)
        
        if pack_result == OK:
            var save_error = ResourceSaver.save(packed_scene, scene_path)
            if save_error != OK:
                log_error("Failed to save scene: " + str(save_error))
                scene_root.queue_free()
                quit(1)
            if debug_mode:
                log_debug("Scene saved successfully")
        else:
            log_error("Failed to pack scene: " + str(pack_result))
            scene_root.queue_free()
            quit(1)
    
    var result = {
        "scene_path": params.scene_path,
        "source_node": node_path,
        "duplicated_node": {
            "name": new_name,
            "type": duplicate.get_class(),
            "parent": target_parent.name
        },
        "scene_saved": save_scene_after
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# Helper function to set owner recursively for all children
func set_owner_recursive(node: Node, owner: Node):
    for child in node.get_children():
        child.owner = owner
        set_owner_recursive(child, owner)

# Reparent a node to a different parent
func reparent_node(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var node_path = params.node_path
    var new_parent_path = params.new_parent_path
    var save_scene_after = params.get("save_scene", true)
    
    log_info("Reparenting node: " + node_path + " to: " + new_parent_path + " in scene: " + scene_path)
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    if node_path == "root" or node_path == "" or node_path == "res://":
        log_error("Cannot reparent the root node")
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    var target_node = get_node_by_path_v2(scene_root, node_path)
    if not target_node:
        log_error("Node not found: " + node_path)
        scene_root.queue_free()
        quit(1)
    
    if target_node == scene_root:
        log_error("Cannot reparent the root node")
        scene_root.queue_free()
        quit(1)
    
    var new_parent = get_node_by_path_v2(scene_root, new_parent_path)
    if not new_parent:
        log_error("New parent node not found: " + new_parent_path)
        scene_root.queue_free()
        quit(1)
    
    var check_node = new_parent
    while check_node:
        if check_node == target_node:
            log_error("Cannot reparent node to its own descendant")
            scene_root.queue_free()
            quit(1)
        check_node = check_node.get_parent()
    
    var old_parent_name = target_node.get_parent().name if target_node.get_parent() else "none"
    var node_name = target_node.name
    var node_type = target_node.get_class()
    
    if debug_mode:
        log_debug("Reparenting: " + node_name + " from: " + old_parent_name + " to: " + new_parent.name)
    
    target_node.reparent(new_parent)
    target_node.owner = scene_root
    
    set_owner_recursive(target_node, scene_root)
    
    if debug_mode:
        log_debug("Node reparented successfully")
    
    if save_scene_after:
        var packed_scene = PackedScene.new()
        var pack_result = packed_scene.pack(scene_root)
        
        if pack_result == OK:
            var save_error = ResourceSaver.save(packed_scene, scene_path)
            if save_error != OK:
                log_error("Failed to save scene: " + str(save_error))
                scene_root.queue_free()
                quit(1)
            if debug_mode:
                log_debug("Scene saved successfully")
        else:
            log_error("Failed to pack scene: " + str(pack_result))
            scene_root.queue_free()
            quit(1)
    
    var result = {
        "scene_path": params.scene_path,
        "reparented_node": {
            "name": node_name,
            "type": node_type,
            "old_parent": old_parent_name,
            "new_parent": new_parent.name
        },
        "scene_saved": save_scene_after
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

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
        var dir_error = dir.make_dir_recursive(output_dir.substr(6))  # Remove "res://" prefix
        if dir_error != OK:
            printerr("Failed to create directory: " + output_dir + ", error: " + str(dir_error))
            quit(1)
    
    # Save the mesh library
    if item_id > 0:
        if debug_mode:
            print("Saving MeshLibrary to: " + full_output_path)
        var save_error = ResourceSaver.save(mesh_library, full_output_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        
        if save_error == OK:
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
            printerr("Failed to save MeshLibrary: " + str(save_error))
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
            var dir_error = dir.make_dir_recursive(scene_dir.substr(6))  # Remove "res://" prefix
            if dir_error != OK:
                printerr("Failed to create directory: " + scene_dir + ", error: " + str(dir_error))
                quit(1)
    
    # Create a packed scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + save_path)
        var save_error = ResourceSaver.save(packed_scene, save_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        
        if save_error == OK:
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
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))

# ============================================
# Signal Management Functions
# ============================================

# Connect a signal between nodes in a scene
func connect_signal(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var source_node_path = params.source_node_path
    var signal_name = params.signal_name
    var target_node_path = params.target_node_path
    var method_name = params.method_name
    var flags = params.get("flags", 0)
    
    log_info("Connecting signal: " + signal_name + " from " + source_node_path + " to " + target_node_path + "." + method_name)
    
    if debug_mode:
        log_debug("Scene path (with res://): " + scene_path)
        log_debug("Flags: " + str(flags))
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    # Read and parse the .tscn file
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if not file:
        log_error("Failed to open scene file: " + scene_path)
        quit(1)
    
    var content = file.get_as_text()
    file.close()
    
    # Parse the scene to get node information
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    # Validate source node exists
    var source_node = get_node_by_path_v2(scene_root, source_node_path)
    if not source_node:
        log_error("Source node not found: " + source_node_path)
        scene_root.queue_free()
        quit(1)
    
    # Validate target node exists
    var target_node = get_node_by_path_v2(scene_root, target_node_path)
    if not target_node:
        log_error("Target node not found: " + target_node_path)
        scene_root.queue_free()
        quit(1)
    
    # Validate signal exists on source node
    var signal_list = source_node.get_signal_list()
    var signal_exists = false
    for sig in signal_list:
        if sig["name"] == signal_name:
            signal_exists = true
            break
    
    if not signal_exists:
        log_error("Signal '" + signal_name + "' does not exist on node: " + source_node_path + " (type: " + source_node.get_class() + ")")
        scene_root.queue_free()
        quit(1)
    
    if debug_mode:
        log_debug("Signal exists on source node")
    
    # Get node names for connection format
    var source_name = source_node.name
    var target_name = target_node.name
    
    # Build the relative path from source to target for the connection
    # In .tscn files, the "from" and "to" fields use node names
    var source_path_in_scene = get_node_scene_path(source_node, scene_root)
    var target_path_in_scene = get_node_scene_path(target_node, scene_root)
    
    if debug_mode:
        log_debug("Source path in scene: " + source_path_in_scene)
        log_debug("Target path in scene: " + target_path_in_scene)
    
    # Check if connection already exists
    var connection_line = '[connection signal="' + signal_name + '" from="' + source_path_in_scene + '" to="' + target_path_in_scene + '" method="' + method_name + '"'
    
    if content.contains(connection_line):
        log_error("Connection already exists")
        scene_root.queue_free()
        quit(1)
    
    # Build the new connection line
    var new_connection = '[connection signal="' + signal_name + '" from="' + source_path_in_scene + '" to="' + target_path_in_scene + '" method="' + method_name + '"'
    if flags != 0:
        new_connection += ' flags=' + str(flags)
    new_connection += ']'
    
    if debug_mode:
        log_debug("New connection line: " + new_connection)
    
    # Add the connection to the scene file
    # Check if there's already a [connection] section
    if content.contains("[connection"):
        # Append after the last connection
        var last_connection_pos = content.rfind("[connection")
        var line_end = content.find("]", last_connection_pos)
        if line_end != -1:
            var insert_pos = line_end + 1
            content = content.substr(0, insert_pos) + "\n\n" + new_connection + content.substr(insert_pos)
    else:
        # Add new connection section at the end
        content = content.strip_edges() + "\n\n" + new_connection + "\n"
    
    # Write the modified content back
    file = FileAccess.open(scene_path, FileAccess.WRITE)
    if not file:
        log_error("Failed to open scene file for writing: " + scene_path)
        scene_root.queue_free()
        quit(1)
    
    file.store_string(content)
    file.close()
    
    var result = {
        "scene_path": params.scene_path,
        "connection": {
            "source": source_path_in_scene,
            "signal": signal_name,
            "target": target_path_in_scene,
            "method": method_name,
            "flags": flags
        },
        "success": true
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# Helper function to get the scene path of a node (relative to scene root)
func get_node_scene_path(node: Node, scene_root: Node) -> String:
    if node == scene_root:
        return "."
    
    var path_parts = []
    var current = node
    while current != null and current != scene_root:
        path_parts.push_front(current.name)
        current = current.get_parent()
    
    return ".".path_join("/".join(path_parts))

# Disconnect a signal in a scene
func disconnect_signal(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var source_node_path = params.source_node_path
    var signal_name = params.signal_name
    var target_node_path = params.target_node_path
    var method_name = params.method_name
    
    log_info("Disconnecting signal: " + signal_name + " from " + source_node_path + " to " + target_node_path + "." + method_name)
    
    if debug_mode:
        log_debug("Scene path (with res://): " + scene_path)
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    # Read and parse the .tscn file
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if not file:
        log_error("Failed to open scene file: " + scene_path)
        quit(1)
    
    var content = file.get_as_text()
    file.close()
    
    # Load scene to resolve node paths
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    # Get the source and target nodes
    var source_node = get_node_by_path_v2(scene_root, source_node_path)
    var target_node = get_node_by_path_v2(scene_root, target_node_path)
    
    if not source_node:
        log_error("Source node not found: " + source_node_path)
        scene_root.queue_free()
        quit(1)
    
    if not target_node:
        log_error("Target node not found: " + target_node_path)
        scene_root.queue_free()
        quit(1)
    
    # Get scene paths for matching
    var source_path_in_scene = get_node_scene_path(source_node, scene_root)
    var target_path_in_scene = get_node_scene_path(target_node, scene_root)
    
    if debug_mode:
        log_debug("Source path in scene: " + source_path_in_scene)
        log_debug("Target path in scene: " + target_path_in_scene)
    
    # Build a pattern to find and remove the connection
    # We need to match: [connection signal="X" from="Y" to="Z" method="M"...]
    var pattern_base = '[connection signal="' + signal_name + '" from="' + source_path_in_scene + '" to="' + target_path_in_scene + '" method="' + method_name + '"'
    
    var found = false
    var lines = content.split("\n")
    var new_lines = []
    
    for line in lines:
        if line.strip_edges().begins_with("[connection") and line.contains('signal="' + signal_name + '"') and line.contains('from="' + source_path_in_scene + '"') and line.contains('to="' + target_path_in_scene + '"') and line.contains('method="' + method_name + '"'):
            found = true
            if debug_mode:
                log_debug("Found and removing connection: " + line)
            # Skip this line (remove it)
            continue
        new_lines.append(line)
    
    if not found:
        log_error("Connection not found in scene")
        scene_root.queue_free()
        quit(1)
    
    # Write the modified content back
    content = "\n".join(new_lines)
    
    file = FileAccess.open(scene_path, FileAccess.WRITE)
    if not file:
        log_error("Failed to open scene file for writing: " + scene_path)
        scene_root.queue_free()
        quit(1)
    
    file.store_string(content)
    file.close()
    
    var result = {
        "scene_path": params.scene_path,
        "disconnected": {
            "source": source_path_in_scene,
            "signal": signal_name,
            "target": target_path_in_scene,
            "method": method_name
        },
        "success": true
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# List all signal connections in a scene
func list_connections(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var filter_node_path = params.get("node_path", "")
    
    log_info("Listing connections in scene: " + scene_path)
    
    if debug_mode:
        log_debug("Scene path (with res://): " + scene_path)
        if not filter_node_path.is_empty():
            log_debug("Filtering by node: " + filter_node_path)
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    # Read the .tscn file
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if not file:
        log_error("Failed to open scene file: " + scene_path)
        quit(1)
    
    var content = file.get_as_text()
    file.close()
    
    var connections = []
    var lines = content.split("\n")
    
    # If we have a filter, we need to resolve the node path to scene format
    var filter_scene_path = ""
    if not filter_node_path.is_empty():
        var scene = load(scene_path)
        if scene:
            var scene_root = scene.instantiate()
            if scene_root:
                var filter_node = get_node_by_path_v2(scene_root, filter_node_path)
                if filter_node:
                    filter_scene_path = get_node_scene_path(filter_node, scene_root)
                    if debug_mode:
                        log_debug("Filter path in scene format: " + filter_scene_path)
                scene_root.queue_free()
    
    # Parse connection lines
    for line in lines:
        var trimmed = line.strip_edges()
        if trimmed.begins_with("[connection"):
            var connection = parse_connection_line(trimmed)
            if connection != null:
                # Apply filter if specified
                if filter_scene_path.is_empty() or connection["source"] == filter_scene_path or connection["target"] == filter_scene_path:
                    connections.append(connection)
    
    var result = {
        "scene_path": params.scene_path,
        "connections": connections,
        "count": connections.size()
    }
    
    if not filter_node_path.is_empty():
        result["filtered_by"] = filter_node_path
    
    print(JSON.stringify(result))

# Helper function to parse a connection line from .tscn format
func parse_connection_line(line: String) -> Variant:
    # Format: [connection signal="X" from="Y" to="Z" method="M" flags=N]
    var result = {
        "source": "",
        "signal": "",
        "target": "",
        "method": "",
        "flags": 0
    }
    
    # Extract signal
    var signal_match = RegEx.new()
    signal_match.compile('signal="([^"]*)"')
    var signal_result = signal_match.search(line)
    if signal_result:
        result["signal"] = signal_result.get_string(1)
    else:
        return null
    
    # Extract from (source)
    var from_match = RegEx.new()
    from_match.compile('from="([^"]*)"')
    var from_result = from_match.search(line)
    if from_result:
        result["source"] = from_result.get_string(1)
    else:
        return null
    
    # Extract to (target)
    var to_match = RegEx.new()
    to_match.compile('to="([^"]*)"')
    var to_result = to_match.search(line)
    if to_result:
        result["target"] = to_result.get_string(1)
    else:
        return null
    
    # Extract method
    var method_match = RegEx.new()
    method_match.compile('method="([^"]*)"')
    var method_result = method_match.search(line)
    if method_result:
        result["method"] = method_result.get_string(1)
    else:
        return null
    
    # Extract flags (optional)
    var flags_match = RegEx.new()
    flags_match.compile('flags=(\\d+)')
    var flags_result = flags_match.search(line)
    if flags_result:
        result["flags"] = int(flags_result.get_string(1))
    
    return result

# ============================================
# Resource Creation Tools
# ============================================

# Create a custom resource file (.tres)
func create_resource(params):
    var resource_path = params.resource_path
    var resource_type = params.resource_type
    var properties = params.get("properties", {})
    var script_path = params.get("script", "")
    
    if not resource_path.begins_with("res://"):
        resource_path = "res://" + resource_path
    
    log_info("Creating resource: " + resource_path + " of type: " + resource_type)
    
    # Create the resource
    var resource = instantiate_class(resource_type)
    if not resource:
        log_error("Failed to instantiate resource of type: " + resource_type)
        log_error("Make sure the class exists and can be instantiated")
        quit(1)
    
    if debug_mode:
        log_debug("Resource instantiated: " + resource.get_class())
    
    # Attach custom script if provided
    if not script_path.is_empty():
        if not script_path.begins_with("res://"):
            script_path = "res://" + script_path
        
        if not FileAccess.file_exists(script_path):
            log_error("Script file does not exist: " + script_path)
            quit(1)
        
        var script = load(script_path)
        if script:
            resource.set_script(script)
            if debug_mode:
                log_debug("Attached script: " + script_path)
        else:
            log_error("Failed to load script: " + script_path)
            quit(1)
    
    # Set properties
    for prop_name in properties:
        var value = deserialize_value(properties[prop_name])
        resource.set(prop_name, value)
        if debug_mode:
            log_debug("Set property: " + prop_name + " = " + str(value))
    
    # Ensure the directory exists
    var resource_dir = resource_path.get_base_dir()
    if not resource_dir.is_empty() and resource_dir != "res://":
        var dir = DirAccess.open("res://")
        if dir:
            var relative_dir = resource_dir.substr(6) if resource_dir.begins_with("res://") else resource_dir
            if not relative_dir.is_empty() and not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(resource_dir)):
                var err = dir.make_dir_recursive(relative_dir)
                if err != OK:
                    log_error("Failed to create directory: " + resource_dir)
                    quit(1)
    
    # Save the resource
    var save_error = ResourceSaver.save(resource, resource_path)
    if save_error != OK:
        log_error("Failed to save resource: " + str(save_error))
        quit(1)
    
    var result = {
        "resource_path": resource_path,
        "resource_type": resource_type,
        "properties_set": properties.size(),
        "has_script": not script_path.is_empty()
    }
    
    log_info("Resource created successfully at: " + resource_path)
    print(JSON.stringify(result))

# Create a material resource file
func create_material(params):
    var material_path = params.material_path
    var material_type = params.material_type
    var properties = params.get("properties", {})
    var shader_path = params.get("shader", "")
    
    if not material_path.begins_with("res://"):
        material_path = "res://" + material_path
    
    log_info("Creating material: " + material_path + " of type: " + material_type)
    
    # Create the material based on type
    var material: Material
    match material_type:
        "StandardMaterial3D":
            material = StandardMaterial3D.new()
        "ShaderMaterial":
            material = ShaderMaterial.new()
        "CanvasItemMaterial":
            material = CanvasItemMaterial.new()
        "ParticleProcessMaterial":
            material = ParticleProcessMaterial.new()
        _:
            log_error("Unknown material type: " + material_type)
            quit(1)
    
    if debug_mode:
        log_debug("Material created: " + material.get_class())
    
    # Load and set shader for ShaderMaterial
    if material_type == "ShaderMaterial" and not shader_path.is_empty():
        if not shader_path.begins_with("res://"):
            shader_path = "res://" + shader_path
        
        if not FileAccess.file_exists(shader_path):
            log_error("Shader file does not exist: " + shader_path)
            quit(1)
        
        var shader = load(shader_path)
        if shader:
            (material as ShaderMaterial).shader = shader
            if debug_mode:
                log_debug("Attached shader: " + shader_path)
        else:
            log_error("Failed to load shader: " + shader_path)
            quit(1)
    
    # Set properties
    for prop_name in properties:
        var value = deserialize_value(properties[prop_name])
        material.set(prop_name, value)
        if debug_mode:
            log_debug("Set property: " + prop_name + " = " + str(value))
    
    # Ensure the directory exists
    var material_dir = material_path.get_base_dir()
    if not material_dir.is_empty() and material_dir != "res://":
        var dir = DirAccess.open("res://")
        if dir:
            var relative_dir = material_dir.substr(6) if material_dir.begins_with("res://") else material_dir
            if not relative_dir.is_empty() and not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(material_dir)):
                var err = dir.make_dir_recursive(relative_dir)
                if err != OK:
                    log_error("Failed to create directory: " + material_dir)
                    quit(1)
    
    # Save the material
    var save_error = ResourceSaver.save(material, material_path)
    if save_error != OK:
        log_error("Failed to save material: " + str(save_error))
        quit(1)
    
    var result = {
        "material_path": material_path,
        "material_type": material_type,
        "properties_set": properties.size(),
        "has_shader": not shader_path.is_empty()
    }
    
    log_info("Material created successfully at: " + material_path)
    print(JSON.stringify(result))

# Create a shader file (.gdshader)
func create_shader(params):
    var shader_path = params.shader_path
    var shader_type = params.shader_type
    var code = params.get("code", "")
    var template = params.get("template", "")
    
    if not shader_path.begins_with("res://"):
        shader_path = "res://" + shader_path
    
    # Ensure the shader path has .gdshader extension
    if not shader_path.ends_with(".gdshader"):
        shader_path += ".gdshader"
    
    log_info("Creating shader: " + shader_path + " of type: " + shader_type)
    
    # Generate shader code
    var shader_code = ""
    
    if not code.is_empty():
        # Use provided code
        shader_code = code
    elif not template.is_empty():
        # Use predefined template
        shader_code = get_shader_template(shader_type, template)
    else:
        # Use basic template for the shader type
        shader_code = get_shader_template(shader_type, "basic")
    
    if debug_mode:
        log_debug("Shader code length: " + str(shader_code.length()))
    
    # Ensure the directory exists
    var shader_dir = shader_path.get_base_dir()
    if not shader_dir.is_empty() and shader_dir != "res://":
        var dir = DirAccess.open("res://")
        if dir:
            var relative_dir = shader_dir.substr(6) if shader_dir.begins_with("res://") else shader_dir
            if not relative_dir.is_empty() and not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(shader_dir)):
                var err = dir.make_dir_recursive(relative_dir)
                if err != OK:
                    log_error("Failed to create directory: " + shader_dir)
                    quit(1)
    
    # Write the shader file
    var file = FileAccess.open(shader_path, FileAccess.WRITE)
    if not file:
        log_error("Failed to create shader file: " + str(FileAccess.get_open_error()))
        quit(1)
    
    file.store_string(shader_code)
    file.close()
    
    # Verify file was created
    if not FileAccess.file_exists(shader_path):
        log_error("Shader file was not created")
        quit(1)
    
    var result = {
        "shader_path": shader_path,
        "shader_type": shader_type,
        "template_used": template if not template.is_empty() else ("custom" if not code.is_empty() else "basic"),
        "code_length": shader_code.length()
    }
    
    log_info("Shader created successfully at: " + shader_path)
    print(JSON.stringify(result))

# Get shader template based on type and template name
func get_shader_template(shader_type: String, template_name: String) -> String:
    match shader_type:
        "canvas_item":
            return get_canvas_item_shader_template(template_name)
        "spatial":
            return get_spatial_shader_template(template_name)
        "particles":
            return get_particles_shader_template(template_name)
        "sky":
            return get_sky_shader_template(template_name)
        "fog":
            return get_fog_shader_template(template_name)
        _:
            log_error("Unknown shader type: " + shader_type)
            return ""

# Canvas item shader templates
func get_canvas_item_shader_template(template_name: String) -> String:
    match template_name:
        "basic":
            return """shader_type canvas_item;

void fragment() {
    COLOR = texture(TEXTURE, UV);
}
"""
        "color_shift":
            return """shader_type canvas_item;

uniform vec4 shift_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float shift_amount : hint_range(0.0, 1.0) = 0.5;

void fragment() {
    vec4 tex_color = texture(TEXTURE, UV);
    COLOR = mix(tex_color, tex_color * shift_color, shift_amount);
}
"""
        "outline":
            return """shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float outline_width : hint_range(0.0, 10.0) = 1.0;

void fragment() {
    vec4 tex_color = texture(TEXTURE, UV);
    float alpha = tex_color.a;
    
    vec2 size = TEXTURE_PIXEL_SIZE * outline_width;
    float outline_alpha = texture(TEXTURE, UV + vec2(-size.x, 0)).a;
    outline_alpha += texture(TEXTURE, UV + vec2(size.x, 0)).a;
    outline_alpha += texture(TEXTURE, UV + vec2(0, -size.y)).a;
    outline_alpha += texture(TEXTURE, UV + vec2(0, size.y)).a;
    outline_alpha = min(outline_alpha, 1.0);
    
    COLOR = mix(outline_color * outline_alpha, tex_color, alpha);
}
"""
        _:
            return get_canvas_item_shader_template("basic")

# Spatial shader templates
func get_spatial_shader_template(template_name: String) -> String:
    match template_name:
        "basic":
            return """shader_type spatial;

void fragment() {
    ALBEDO = vec3(1.0, 1.0, 1.0);
}
"""
        "textured":
            return """shader_type spatial;

uniform sampler2D albedo_texture : source_color;
uniform float roughness : hint_range(0.0, 1.0) = 0.5;
uniform float metallic : hint_range(0.0, 1.0) = 0.0;

void fragment() {
    ALBEDO = texture(albedo_texture, UV).rgb;
    ROUGHNESS = roughness;
    METALLIC = metallic;
}
"""
        "toon":
            return """shader_type spatial;

uniform vec4 albedo_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float steps : hint_range(1.0, 10.0) = 3.0;

void fragment() {
    ALBEDO = albedo_color.rgb;
}

void light() {
    float NdotL = dot(NORMAL, LIGHT);
    float intensity = floor(NdotL * steps) / steps;
    DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * intensity;
}
"""
        _:
            return get_spatial_shader_template("basic")

# Particles shader templates
func get_particles_shader_template(template_name: String) -> String:
    match template_name:
        "basic":
            return """shader_type particles;

uniform float spread : hint_range(0.0, 180.0) = 45.0;
uniform float initial_velocity : hint_range(0.0, 100.0) = 5.0;

void start() {
    float angle = radians(spread) * (2.0 * RANDOM.x - 1.0);
    VELOCITY = vec3(sin(angle), cos(angle), 0.0) * initial_velocity;
}

void process() {
    // Apply gravity
    VELOCITY.y -= 9.8 * DELTA;
}
"""
        _:
            return get_particles_shader_template("basic")

# Sky shader templates
func get_sky_shader_template(template_name: String) -> String:
    match template_name:
        "basic":
            return """shader_type sky;

uniform vec4 top_color : source_color = vec4(0.4, 0.6, 1.0, 1.0);
uniform vec4 bottom_color : source_color = vec4(0.8, 0.9, 1.0, 1.0);

void sky() {
    float t = clamp(EYEDIR.y * 0.5 + 0.5, 0.0, 1.0);
    COLOR = mix(bottom_color.rgb, top_color.rgb, t);
}
"""
        _:
            return get_sky_shader_template("basic")

# Fog shader templates
func get_fog_shader_template(template_name: String) -> String:
    match template_name:
        "basic":
            return """shader_type fog;

uniform vec4 fog_color : source_color = vec4(0.5, 0.6, 0.7, 1.0);
uniform float density : hint_range(0.0, 1.0) = 0.1;

void fog() {
    DENSITY = density;
    ALBEDO = fog_color.rgb;
}
"""
        _:
            return get_fog_shader_template("basic")

# ============================================
# Animation Tools
# ============================================

# Create a new animation in an AnimationPlayer node
func create_animation(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var player_node_path = params.player_node_path
    var animation_name = params.animation_name
    var length = params.get("length", 1.0)
    var loop_mode_str = params.get("loop_mode", "none")
    var step = params.get("step", 0.1)
    
    log_info("Creating animation: " + animation_name + " in scene: " + scene_path)
    
    if debug_mode:
        log_debug("Scene path (with res://): " + scene_path)
        log_debug("Player node path: " + player_node_path)
        log_debug("Animation name: " + animation_name)
        log_debug("Length: " + str(length))
        log_debug("Loop mode: " + loop_mode_str)
        log_debug("Step: " + str(step))
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    # Find the AnimationPlayer node
    var player_node = get_node_by_path_v2(scene_root, player_node_path)
    if not player_node:
        log_error("AnimationPlayer node not found: " + player_node_path)
        scene_root.queue_free()
        quit(1)
    
    if not player_node is AnimationPlayer:
        log_error("Node is not an AnimationPlayer: " + player_node_path + " (type: " + player_node.get_class() + ")")
        scene_root.queue_free()
        quit(1)
    
    var animation_player: AnimationPlayer = player_node as AnimationPlayer
    
    if debug_mode:
        log_debug("Found AnimationPlayer: " + animation_player.name)
    
    # Check if animation already exists
    if animation_player.has_animation(animation_name):
        log_error("Animation already exists: " + animation_name)
        scene_root.queue_free()
        quit(1)
    
    # Create a new Animation resource
    var animation = Animation.new()
    animation.length = length
    animation.step = step
    
    # Set loop mode
    # Animation.LOOP_NONE = 0, LOOP_LINEAR = 1, LOOP_PINGPONG = 2
    match loop_mode_str:
        "none":
            animation.loop_mode = Animation.LOOP_NONE
        "linear":
            animation.loop_mode = Animation.LOOP_LINEAR
        "pingpong":
            animation.loop_mode = Animation.LOOP_PINGPONG
        _:
            animation.loop_mode = Animation.LOOP_NONE
    
    if debug_mode:
        log_debug("Animation created with length: " + str(animation.length) + ", loop_mode: " + str(animation.loop_mode))
    
    # Get or create the AnimationLibrary
    var library: AnimationLibrary
    var library_name = ""
    
    # In Godot 4.x, animations are stored in AnimationLibrary
    # Check if there's an existing library
    var library_list = animation_player.get_animation_library_list()
    if library_list.size() > 0:
        library_name = library_list[0]
        library = animation_player.get_animation_library(library_name)
        if debug_mode:
            log_debug("Using existing library: " + library_name)
    else:
        # Create a new library
        library = AnimationLibrary.new()
        library_name = ""
        animation_player.add_animation_library(library_name, library)
        if debug_mode:
            log_debug("Created new animation library")
    
    # Add the animation to the library
    var add_error = library.add_animation(animation_name, animation)
    if add_error != OK:
        log_error("Failed to add animation to library: " + str(add_error))
        scene_root.queue_free()
        quit(1)
    
    if debug_mode:
        log_debug("Animation added to library")
    
    # Save the scene
    var packed_scene = PackedScene.new()
    var pack_result = packed_scene.pack(scene_root)
    
    if pack_result == OK:
        var save_error = ResourceSaver.save(packed_scene, scene_path)
        if save_error != OK:
            log_error("Failed to save scene: " + str(save_error))
            scene_root.queue_free()
            quit(1)
        if debug_mode:
            log_debug("Scene saved successfully")
    else:
        log_error("Failed to pack scene: " + str(pack_result))
        scene_root.queue_free()
        quit(1)
    
    var result = {
        "scene_path": params.scene_path,
        "player_node_path": player_node_path,
        "animation_name": animation_name,
        "length": length,
        "loop_mode": loop_mode_str,
        "step": step,
        "library_name": library_name if not library_name.is_empty() else "(default)"
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# Add a track to an existing animation in an AnimationPlayer
func add_animation_track(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var player_node_path = params.player_node_path
    var animation_name = params.animation_name
    var track = params.track
    
    log_info("Adding track to animation: " + animation_name + " in scene: " + scene_path)
    
    if debug_mode:
        log_debug("Scene path (with res://): " + scene_path)
        log_debug("Player node path: " + player_node_path)
        log_debug("Animation name: " + animation_name)
        log_debug("Track: " + JSON.stringify(track))
    
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    # Find the AnimationPlayer node
    var player_node = get_node_by_path_v2(scene_root, player_node_path)
    if not player_node:
        log_error("AnimationPlayer node not found: " + player_node_path)
        scene_root.queue_free()
        quit(1)
    
    if not player_node is AnimationPlayer:
        log_error("Node is not an AnimationPlayer: " + player_node_path + " (type: " + player_node.get_class() + ")")
        scene_root.queue_free()
        quit(1)
    
    var animation_player: AnimationPlayer = player_node as AnimationPlayer
    
    if debug_mode:
        log_debug("Found AnimationPlayer: " + animation_player.name)
    
    # Find the animation
    var animation: Animation = null
    var library_list = animation_player.get_animation_library_list()
    
    for lib_name in library_list:
        var lib = animation_player.get_animation_library(lib_name)
        if lib.has_animation(animation_name):
            animation = lib.get_animation(animation_name)
            if debug_mode:
                log_debug("Found animation in library: " + lib_name)
            break
    
    if animation == null:
        log_error("Animation not found: " + animation_name)
        scene_root.queue_free()
        quit(1)
    
    # Parse track configuration
    var track_type_str = track.get("type", "property")
    var node_path = track.get("node_path", track.get("nodePath", ""))
    var property_name = track.get("property", "")
    var method_name = track.get("method", "")
    var keyframes = track.get("keyframes", [])
    
    if node_path.is_empty():
        log_error("Track node path is required")
        scene_root.queue_free()
        quit(1)
    
    if keyframes.size() == 0:
        log_error("Track must have at least one keyframe")
        scene_root.queue_free()
        quit(1)
    
    # Create the track
    var track_idx: int
    var track_path: String
    
    if track_type_str == "property":
        if property_name.is_empty():
            log_error("Property name is required for property track")
            scene_root.queue_free()
            quit(1)
        
        # Create property track
        track_idx = animation.add_track(Animation.TYPE_VALUE)
        track_path = node_path + ":" + property_name
        animation.track_set_path(track_idx, track_path)
        
        if debug_mode:
            log_debug("Created property track at index: " + str(track_idx) + " with path: " + track_path)
        
        # Insert keyframes
        for keyframe in keyframes:
            var time = keyframe.get("time", 0.0)
            var value = deserialize_value(keyframe.get("value", null))
            
            animation.track_insert_key(track_idx, time, value)
            
            if debug_mode:
                log_debug("Inserted keyframe at time: " + str(time) + " with value: " + str(value))
    
    elif track_type_str == "method":
        if method_name.is_empty():
            log_error("Method name is required for method track")
            scene_root.queue_free()
            quit(1)
        
        # Create method track
        track_idx = animation.add_track(Animation.TYPE_METHOD)
        track_path = node_path
        animation.track_set_path(track_idx, track_path)
        
        if debug_mode:
            log_debug("Created method track at index: " + str(track_idx) + " with path: " + track_path)
        
        # Insert keyframes (method calls)
        for keyframe in keyframes:
            var time = keyframe.get("time", 0.0)
            var args_raw = keyframe.get("args", [])
            
            # Deserialize arguments
            var args = []
            for arg in args_raw:
                args.append(deserialize_value(arg))
            
            # Create the method call dictionary
            var method_call = {
                "method": method_name,
                "args": args
            }
            
            animation.track_insert_key(track_idx, time, method_call)
            
            if debug_mode:
                log_debug("Inserted method call at time: " + str(time) + " method: " + method_name + " args: " + str(args))
    
    else:
        log_error("Unknown track type: " + track_type_str)
        scene_root.queue_free()
        quit(1)
    
    # Save the scene
    var packed_scene = PackedScene.new()
    var pack_result = packed_scene.pack(scene_root)
    
    if pack_result == OK:
        var save_error = ResourceSaver.save(packed_scene, scene_path)
        if save_error != OK:
            log_error("Failed to save scene: " + str(save_error))
            scene_root.queue_free()
            quit(1)
        if debug_mode:
            log_debug("Scene saved successfully")
    else:
        log_error("Failed to pack scene: " + str(pack_result))
        scene_root.queue_free()
        quit(1)
    
    var result = {
        "scene_path": params.scene_path,
        "animation_name": animation_name,
        "track_index": track_idx,
        "track_type": track_type_str,
        "track_path": track_path,
        "keyframes_count": keyframes.size()
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()

# ============================================
# Plugin Management Tools
# ============================================

# List all plugins in the project with their status
func list_plugins(params):
    log_info("Listing plugins")
    
    var result = {
        "plugins": [],
        "addons_directory_exists": false,
        "enabled_count": 0,
        "disabled_count": 0
    }
    
    # Check if addons directory exists
    var addons_path = "res://addons/"
    if not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(addons_path)):
        result["addons_directory_exists"] = false
        result["message"] = "No addons directory found in the project"
        print(JSON.stringify(result))
        return
    
    result["addons_directory_exists"] = true
    
    # Get enabled plugins from project.godot
    var enabled_plugins = []
    var config = ConfigFile.new()
    var err = config.load("res://project.godot")
    if err == OK:
        if config.has_section("editor_plugins"):
            var enabled_value = config.get_value("editor_plugins", "enabled", "")
            if enabled_value is String and not enabled_value.is_empty():
                # Parse the enabled plugins format: PackedStringArray("res://addons/plugin1/plugin.cfg", ...)
                var regex = RegEx.new()
                regex.compile("res://addons/([^/]+)/plugin.cfg")
                var matches = regex.search_all(enabled_value)
                for m in matches:
                    enabled_plugins.append(m.get_string(1))
    
    if debug_mode:
        log_debug("Enabled plugins: " + str(enabled_plugins))
    
    # Scan addons directory
    var dir = DirAccess.open(addons_path)
    if dir:
        dir.list_dir_begin()
        var folder_name = dir.get_next()
        
        while folder_name != "":
            if dir.current_is_dir() and not folder_name.begins_with("."):
                var plugin_cfg_path = addons_path + folder_name + "/plugin.cfg"
                
                if FileAccess.file_exists(plugin_cfg_path):
                    var plugin_info = {
                        "name": folder_name,
                        "path": addons_path + folder_name,
                        "enabled": folder_name in enabled_plugins
                    }
                    
                    # Read plugin.cfg for additional info
                    var plugin_config = ConfigFile.new()
                    var plugin_err = plugin_config.load(plugin_cfg_path)
                    if plugin_err == OK:
                        plugin_info["display_name"] = plugin_config.get_value("plugin", "name", folder_name)
                        plugin_info["description"] = plugin_config.get_value("plugin", "description", "")
                        plugin_info["author"] = plugin_config.get_value("plugin", "author", "")
                        plugin_info["version"] = plugin_config.get_value("plugin", "version", "")
                        plugin_info["script"] = plugin_config.get_value("plugin", "script", "")
                    
                    result["plugins"].append(plugin_info)
                    
                    if plugin_info["enabled"]:
                        result["enabled_count"] += 1
                    else:
                        result["disabled_count"] += 1
            
            folder_name = dir.get_next()
        
        dir.list_dir_end()
    
    print(JSON.stringify(result))

# Enable a plugin
func enable_plugin(params):
    var plugin_name = params.plugin_name
    
    log_info("Enabling plugin: " + plugin_name)
    
    # Check if plugin exists
    var plugin_cfg_path = "res://addons/" + plugin_name + "/plugin.cfg"
    if not FileAccess.file_exists(plugin_cfg_path):
        log_error("Plugin not found: " + plugin_name)
        log_error("Expected plugin.cfg at: " + plugin_cfg_path)
        quit(1)
    
    # Read project.godot
    var config = ConfigFile.new()
    var err = config.load("res://project.godot")
    if err != OK:
        log_error("Failed to load project.godot: " + str(err))
        quit(1)
    
    # Get current enabled plugins
    var enabled_plugins = []
    if config.has_section("editor_plugins"):
        var enabled_value = config.get_value("editor_plugins", "enabled", "")
        if enabled_value is String and not enabled_value.is_empty():
            var regex = RegEx.new()
            regex.compile("res://addons/([^/]+)/plugin.cfg")
            var matches = regex.search_all(enabled_value)
            for m in matches:
                enabled_plugins.append(m.get_string(1))
    
    # Check if already enabled
    if plugin_name in enabled_plugins:
        var result = {
            "plugin_name": plugin_name,
            "action": "already_enabled",
            "message": "Plugin is already enabled"
        }
        print(JSON.stringify(result))
        return
    
    # Add to enabled plugins
    enabled_plugins.append(plugin_name)
    
    # Build the PackedStringArray format
    var enabled_paths = []
    for p in enabled_plugins:
        enabled_paths.append("res://addons/" + p + "/plugin.cfg")
    
    var enabled_string = "PackedStringArray(\"" + "\", \"".join(enabled_paths) + "\")"
    config.set_value("editor_plugins", "enabled", enabled_string)
    
    # Save project.godot
    err = config.save("res://project.godot")
    if err != OK:
        log_error("Failed to save project.godot: " + str(err))
        quit(1)
    
    var result = {
        "plugin_name": plugin_name,
        "action": "enabled",
        "enabled_plugins": enabled_plugins
    }
    
    print(JSON.stringify(result))

# Disable a plugin
func disable_plugin(params):
    var plugin_name = params.plugin_name
    
    log_info("Disabling plugin: " + plugin_name)
    
    # Read project.godot
    var config = ConfigFile.new()
    var err = config.load("res://project.godot")
    if err != OK:
        log_error("Failed to load project.godot: " + str(err))
        quit(1)
    
    # Get current enabled plugins
    var enabled_plugins = []
    if config.has_section("editor_plugins"):
        var enabled_value = config.get_value("editor_plugins", "enabled", "")
        if enabled_value is String and not enabled_value.is_empty():
            var regex = RegEx.new()
            regex.compile("res://addons/([^/]+)/plugin.cfg")
            var matches = regex.search_all(enabled_value)
            for m in matches:
                enabled_plugins.append(m.get_string(1))
    
    # Check if plugin is in enabled list
    if not plugin_name in enabled_plugins:
        var result = {
            "plugin_name": plugin_name,
            "action": "already_disabled",
            "message": "Plugin is not currently enabled"
        }
        print(JSON.stringify(result))
        return
    
    # Remove from enabled plugins
    enabled_plugins.erase(plugin_name)
    
    # Build the PackedStringArray format
    if enabled_plugins.size() > 0:
        var enabled_paths = []
        for p in enabled_plugins:
            enabled_paths.append("res://addons/" + p + "/plugin.cfg")
        var enabled_string = "PackedStringArray(\"" + "\", \"".join(enabled_paths) + "\")"
        config.set_value("editor_plugins", "enabled", enabled_string)
    else:
        # Remove the key if no plugins are enabled
        if config.has_section_key("editor_plugins", "enabled"):
            config.erase_section_key("editor_plugins", "enabled")
    
    # Save project.godot
    err = config.save("res://project.godot")
    if err != OK:
        log_error("Failed to save project.godot: " + str(err))
        quit(1)
    
    var result = {
        "plugin_name": plugin_name,
        "action": "disabled",
        "enabled_plugins": enabled_plugins
    }
    
    print(JSON.stringify(result))

# ============================================
# Input Action Tools
# ============================================

# Add an input action to the InputMap
func add_input_action(params):
    var action_name = params.action_name
    var events = params.events
    var deadzone = params.get("deadzone", 0.5)
    
    log_info("Adding input action: " + action_name)
    
    if debug_mode:
        log_debug("Events: " + JSON.stringify(events))
        log_debug("Deadzone: " + str(deadzone))
    
    # Read project.godot
    var config = ConfigFile.new()
    var err = config.load("res://project.godot")
    if err != OK:
        log_error("Failed to load project.godot: " + str(err))
        quit(1)
    
    # Build the input action configuration
    var events_config = []
    
    for event in events:
        var event_type = event.get("type", "")
        var event_config = {}
        
        match event_type:
            "key":
                var keycode = event.get("keycode", "")
                if keycode.is_empty():
                    log_error("Keycode is required for key events")
                    continue
                
                event_config = {
                    "class_name": "InputEventKey",
                    "keycode": get_keycode_value(keycode)
                }
                
                # Add modifiers
                if event.get("ctrl", false):
                    event_config["ctrl_pressed"] = true
                if event.get("alt", false):
                    event_config["alt_pressed"] = true
                if event.get("shift", false):
                    event_config["shift_pressed"] = true
                
                events_config.append(event_config)
            
            "mouse_button":
                var button = event.get("button", 1)
                event_config = {
                    "class_name": "InputEventMouseButton",
                    "button_index": button
                }
                events_config.append(event_config)
            
            "joypad_button":
                var button = event.get("button", 0)
                event_config = {
                    "class_name": "InputEventJoypadButton",
                    "button_index": button
                }
                events_config.append(event_config)
            
            "joypad_axis":
                var axis = event.get("axis", 0)
                var axis_value = event.get("axis_value", event.get("axisValue", 1))
                event_config = {
                    "class_name": "InputEventJoypadMotion",
                    "axis": axis,
                    "axis_value": axis_value
                }
                events_config.append(event_config)
            
            _:
                log_error("Unknown event type: " + event_type)
    
    if events_config.size() == 0:
        log_error("No valid events provided")
        quit(1)
    
    # Format the action value for project.godot
    # Format: {"deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":32,"physical_keycode":0,"key_label":0,"unicode":0,"echo":false,"script":null)]}
    var action_value = build_input_action_string(deadzone, events_config)
    
    # Set the input action
    config.set_value("input", action_name, action_value)
    
    # Save project.godot
    err = config.save("res://project.godot")
    if err != OK:
        log_error("Failed to save project.godot: " + str(err))
        quit(1)
    
    var result = {
        "action_name": action_name,
        "events_count": events_config.size(),
        "deadzone": deadzone,
        "events": events_config
    }
    
    print(JSON.stringify(result))

# Helper: Get keycode value from key name
func get_keycode_value(key_name: String) -> int:
    # Map common key names to their Godot key codes
    var key_map = {
        # Letters
        "A": KEY_A, "B": KEY_B, "C": KEY_C, "D": KEY_D, "E": KEY_E,
        "F": KEY_F, "G": KEY_G, "H": KEY_H, "I": KEY_I, "J": KEY_J,
        "K": KEY_K, "L": KEY_L, "M": KEY_M, "N": KEY_N, "O": KEY_O,
        "P": KEY_P, "Q": KEY_Q, "R": KEY_R, "S": KEY_S, "T": KEY_T,
        "U": KEY_U, "V": KEY_V, "W": KEY_W, "X": KEY_X, "Y": KEY_Y, "Z": KEY_Z,
        # Numbers
        "0": KEY_0, "1": KEY_1, "2": KEY_2, "3": KEY_3, "4": KEY_4,
        "5": KEY_5, "6": KEY_6, "7": KEY_7, "8": KEY_8, "9": KEY_9,
        # Function keys
        "F1": KEY_F1, "F2": KEY_F2, "F3": KEY_F3, "F4": KEY_F4,
        "F5": KEY_F5, "F6": KEY_F6, "F7": KEY_F7, "F8": KEY_F8,
        "F9": KEY_F9, "F10": KEY_F10, "F11": KEY_F11, "F12": KEY_F12,
        # Special keys
        "Space": KEY_SPACE, "Escape": KEY_ESCAPE, "Tab": KEY_TAB,
        "Enter": KEY_ENTER, "Return": KEY_ENTER,
        "Backspace": KEY_BACKSPACE, "Delete": KEY_DELETE,
        "Up": KEY_UP, "Down": KEY_DOWN, "Left": KEY_LEFT, "Right": KEY_RIGHT,
        "Home": KEY_HOME, "End": KEY_END,
        "PageUp": KEY_PAGEUP, "PageDown": KEY_PAGEDOWN,
        "Insert": KEY_INSERT,
        "Shift": KEY_SHIFT, "Ctrl": KEY_CTRL, "Alt": KEY_ALT,
        "CapsLock": KEY_CAPSLOCK, "NumLock": KEY_NUMLOCK,
        # Numpad
        "KP0": KEY_KP_0, "KP1": KEY_KP_1, "KP2": KEY_KP_2, "KP3": KEY_KP_3,
        "KP4": KEY_KP_4, "KP5": KEY_KP_5, "KP6": KEY_KP_6, "KP7": KEY_KP_7,
        "KP8": KEY_KP_8, "KP9": KEY_KP_9,
        # Punctuation
        "Comma": KEY_COMMA, "Period": KEY_PERIOD,
        "Slash": KEY_SLASH, "Backslash": KEY_BACKSLASH,
        "Semicolon": KEY_SEMICOLON, "Apostrophe": KEY_APOSTROPHE,
        "BracketLeft": KEY_BRACKETLEFT, "BracketRight": KEY_BRACKETRIGHT,
        "Minus": KEY_MINUS, "Equal": KEY_EQUAL,
    }
    
    var upper_key = key_name.to_upper()
    if key_map.has(upper_key):
        return key_map[upper_key]
    elif key_map.has(key_name):
        return key_map[key_name]
    
    # If not found, try to find by exact match or lowercase version
    for k in key_map:
        if k.to_lower() == key_name.to_lower():
            return key_map[k]
    
    log_error("Unknown key: " + key_name)
    return 0

# Helper: Build input action string for project.godot
func build_input_action_string(deadzone: float, events: Array) -> String:
    var events_str = []
    
    for event in events:
        var evt_class = event.get("class_name", "")
        var obj_str = ""
        
        match evt_class:
            "InputEventKey":
                var keycode = event.get("keycode", 0)
                var ctrl = event.get("ctrl_pressed", false)
                var alt = event.get("alt_pressed", false)
                var shift = event.get("shift_pressed", false)
                obj_str = 'Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":%s,"shift_pressed":%s,"ctrl_pressed":%s,"meta_pressed":false,"pressed":false,"keycode":%d,"physical_keycode":0,"key_label":0,"unicode":0,"echo":false,"script":null)' % [str(alt).to_lower(), str(shift).to_lower(), str(ctrl).to_lower(), keycode]
            
            "InputEventMouseButton":
                var button_index = event.get("button_index", 1)
                obj_str = 'Object(InputEventMouseButton,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"button_mask":0,"position":Vector2(0, 0),"global_position":Vector2(0, 0),"factor":1.0,"button_index":%d,"canceled":false,"pressed":false,"double_click":false,"script":null)' % button_index
            
            "InputEventJoypadButton":
                var button_index = event.get("button_index", 0)
                obj_str = 'Object(InputEventJoypadButton,"resource_local_to_scene":false,"resource_name":"","device":-1,"button_index":%d,"pressure":0.0,"pressed":false,"script":null)' % button_index
            
            "InputEventJoypadMotion":
                var axis = event.get("axis", 0)
                var axis_value = event.get("axis_value", 1.0)
                obj_str = 'Object(InputEventJoypadMotion,"resource_local_to_scene":false,"resource_name":"","device":-1,"axis":%d,"axis_value":%f,"script":null)' % [axis, axis_value]
        
        if not obj_str.is_empty():
            events_str.append(obj_str)
    
    return '{"deadzone": %f, "events": [%s]}' % [deadzone, ", ".join(events_str)]

# ============================================
# Project Search Tool
# ============================================

# Search for text or patterns across project files
func search_project(params):
    var query = params.query
    var file_types = params.get("file_types", ["gd", "tscn", "tres"])
    var use_regex = params.get("regex", false)
    var case_sensitive = params.get("case_sensitive", false)
    var max_results = params.get("max_results", 100)
    
    log_info("Searching project for: " + query)
    
    if debug_mode:
        log_debug("File types: " + str(file_types))
        log_debug("Use regex: " + str(use_regex))
        log_debug("Case sensitive: " + str(case_sensitive))
        log_debug("Max results: " + str(max_results))
    
    var result = {
        "query": query,
        "results": [],
        "summary": {
            "files_searched": 0,
            "files_with_matches": 0,
            "total_matches": 0,
            "truncated": false
        }
    }
    
    # Compile regex if needed
    var regex: RegEx = null
    if use_regex:
        regex = RegEx.new()
        var regex_err = regex.compile(query)
        if regex_err != OK:
            log_error("Invalid regex pattern: " + query)
            quit(1)
    
    # Get all files to search
    var files_to_search = []
    for ext in file_types:
        files_to_search.append_array(find_files("res://", "." + ext))
    
    result["summary"]["files_searched"] = files_to_search.size()
    
    if debug_mode:
        log_debug("Files to search: " + str(files_to_search.size()))
    
    # Search each file
    for file_path in files_to_search:
        if result["summary"]["total_matches"] >= max_results:
            result["summary"]["truncated"] = true
            break
        
        var file = FileAccess.open(file_path, FileAccess.READ)
        if not file:
            continue
        
        var content = file.get_as_text()
        file.close()
        
        var lines = content.split("\n")
        var file_matches = []
        
        for i in range(lines.size()):
            if result["summary"]["total_matches"] >= max_results:
                result["summary"]["truncated"] = true
                break
            
            var line = lines[i]
            var line_to_check = line if case_sensitive else line.to_lower()
            var query_to_check = query if case_sensitive else query.to_lower()
            var matched = false
            var match_content = ""
            
            if use_regex:
                var match_result = regex.search(line)
                if match_result:
                    matched = true
                    match_content = match_result.get_string()
            else:
                if query_to_check in line_to_check:
                    matched = true
                    match_content = query
            
            if matched:
                file_matches.append({
                    "line": i + 1,
                    "content": line.strip_edges(),
                    "match": match_content
                })
                result["summary"]["total_matches"] += 1
        
        if file_matches.size() > 0:
            result["results"].append({
                "file": file_path,
                "matches": file_matches
            })
            result["summary"]["files_with_matches"] += 1
    
    print(JSON.stringify(result))

# ============================================
# 2D Tile Tools
# ============================================

# Create a TileSet resource with atlas sources
func create_tileset(params):
    var tileset_path = params.tileset_path
    var sources = params.sources
    
    log_info("Creating TileSet: " + tileset_path)
    
    # Ensure tileset path has res:// prefix
    var full_tileset_path = tileset_path
    if not full_tileset_path.begins_with("res://"):
        full_tileset_path = "res://" + full_tileset_path
    
    # Create the TileSet
    var tileset = TileSet.new()
    tileset.tile_shape = TileSet.TILE_SHAPE_SQUARE
    
    var source_ids = []
    var source_index = 0
    
    for source in sources:
        var texture_path = source.texture
        if not texture_path.begins_with("res://"):
            texture_path = "res://" + texture_path
        
        log_debug("Adding atlas source from texture: " + texture_path)
        
        # Verify texture exists
        if not FileAccess.file_exists(texture_path):
            log_error("Texture file does not exist: " + texture_path)
            quit(1)
        
        # Load the texture
        var texture = load(texture_path)
        if not texture:
            log_error("Failed to load texture: " + texture_path)
            quit(1)
        
        # Create atlas source
        var atlas = TileSetAtlasSource.new()
        atlas.texture = texture
        
        # Set tile size
        var tile_size = source.tile_size
        atlas.texture_region_size = Vector2i(int(tile_size.x), int(tile_size.y))
        
        # Set separation if provided
        if source.has("separation") and source.separation:
            var sep = source.separation
            atlas.separation = Vector2i(int(sep.get("x", 0)), int(sep.get("y", 0)))
        
        # Set margins/offset if provided
        if source.has("offset") and source.offset:
            var off = source.offset
            atlas.margins = Vector2i(int(off.get("x", 0)), int(off.get("y", 0)))
        
        # Add source to tileset
        var source_id = tileset.add_source(atlas)
        source_ids.append(source_id)
        
        log_debug("Added source with ID: " + str(source_id))
        source_index += 1
    
    # Ensure the directory exists
    var dir_path = full_tileset_path.get_base_dir()
    if dir_path != "res://" and not dir_path.is_empty():
        var relative_dir = dir_path.substr(6) if dir_path.begins_with("res://") else dir_path
        if not relative_dir.is_empty():
            var dir = DirAccess.open("res://")
            if dir and not dir.dir_exists(relative_dir):
                var err = dir.make_dir_recursive(relative_dir)
                if err != OK:
                    log_error("Failed to create directory: " + dir_path)
                    quit(1)
    
    # Save the TileSet
    var save_error = ResourceSaver.save(tileset, full_tileset_path)
    if save_error != OK:
        log_error("Failed to save TileSet: " + str(save_error))
        quit(1)
    
    var result = {
        "success": true,
        "tileset_path": tileset_path,
        "full_path": full_tileset_path,
        "sources_added": source_ids.size(),
        "source_ids": source_ids
    }
    
    print(JSON.stringify(result))

# Set cells in a TileMap node within a scene
func set_tilemap_cells(params):
    var scene_path = normalize_scene_path_v2(params.scene_path)
    var tilemap_path = params.tilemap_node_path
    var layer = params.get("layer", 0)
    var cells = params.cells
    
    log_info("Setting TileMap cells in scene: " + scene_path)
    log_debug("TileMap node path: " + tilemap_path)
    log_debug("Layer: " + str(layer))
    log_debug("Number of cells: " + str(cells.size()))
    
    # Load the scene
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file does not exist: " + scene_path)
        quit(1)
    
    var scene = load(scene_path)
    if not scene:
        log_error("Failed to load scene: " + scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    if not scene_root:
        log_error("Failed to instantiate scene")
        quit(1)
    
    # Find the TileMap node
    var tilemap = get_node_by_path_v2(scene_root, tilemap_path)
    if not tilemap:
        log_error("TileMap node not found: " + tilemap_path)
        scene_root.queue_free()
        quit(1)
    
    # Verify it's a TileMap
    if not tilemap is TileMap:
        log_error("Node is not a TileMap: " + tilemap_path + " (is " + tilemap.get_class() + ")")
        scene_root.queue_free()
        quit(1)
    
    log_debug("Found TileMap: " + tilemap.name)
    
    # Check if TileMap has a TileSet
    if not tilemap.tile_set:
        log_error("TileMap does not have a TileSet assigned")
        scene_root.queue_free()
        quit(1)
    
    # Set cells
    var cells_set = 0
    var errors = []
    
    for cell in cells:
        var coords = Vector2i(int(cell.coords.x), int(cell.coords.y))
        var source_id = int(cell.source_id)
        var atlas_coords = Vector2i(int(cell.atlas_coords.x), int(cell.atlas_coords.y))
        var alternative_tile = int(cell.get("alternative_tile", 0))
        
        # Verify source exists in TileSet
        if not tilemap.tile_set.has_source(source_id):
            errors.append("Source ID " + str(source_id) + " not found in TileSet")
            continue
        
        # Set the cell
        tilemap.set_cell(layer, coords, source_id, atlas_coords, alternative_tile)
        cells_set += 1
        
        if debug_mode:
            log_debug("Set cell at " + str(coords) + " with source " + str(source_id) + " atlas " + str(atlas_coords))
    
    # Save the scene
    var packed_scene = PackedScene.new()
    var pack_result = packed_scene.pack(scene_root)
    
    if pack_result != OK:
        log_error("Failed to pack scene: " + str(pack_result))
        scene_root.queue_free()
        quit(1)
    
    var save_error = ResourceSaver.save(packed_scene, scene_path)
    if save_error != OK:
        log_error("Failed to save scene: " + str(save_error))
        scene_root.queue_free()
        quit(1)
    
    var result = {
        "success": true,
        "scene_path": params.scene_path,
        "tilemap_node": tilemap_path,
        "layer": layer,
        "cells_set": cells_set,
        "errors": errors
    }
    
    print(JSON.stringify(result))
    scene_root.queue_free()
