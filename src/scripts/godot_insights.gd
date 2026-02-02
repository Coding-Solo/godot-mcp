class_name GodotInsights
extends RefCounted

enum AnalysisLevel {
    SURFACE,
    DETAILED
}

var _analysis_context: Dictionary = {}
var _insights_cache: Dictionary = {}
var _project_metadata: Dictionary = {}
var _global_class_registry: Dictionary = {}
var _global_class_registry_loaded: bool = false
var debug_mode: bool = false

# Builtin type definitions for _behavior_is_builtin_call (class-level constants)
const _PRIMITIVE_TYPES = [
    "Array", "Dictionary", "String", "Signal",
    "PackedByteArray", "PackedInt32Array", "PackedInt64Array",
    "PackedFloat32Array", "PackedFloat64Array", "PackedStringArray",
    "PackedVector2Array", "PackedVector3Array", "PackedColorArray"
]

const _PACKED_ARRAY_METHODS = ["append", "append_array", "clear", "size", "is_empty", 
                               "resize", "has", "reverse", "slice", "sort", "duplicate"]

const _PRIMITIVE_METHODS = {
    "Signal": ["connect", "disconnect", "emit", "is_connected", "get_connections", "is_null"],
    "Array": ["append", "clear", "size", "is_empty", "has", "erase", "find", "rfind",
              "pop_back", "pop_front", "push_back", "push_front", "remove_at", "insert",
              "sort", "sort_custom", "reverse", "shuffle", "slice", "duplicate", "resize"],
    "Dictionary": ["clear", "size", "is_empty", "has", "has_all", "erase", "keys", "values",
                   "merge", "duplicate", "get"],
    "String": ["begins_with", "ends_with", "contains", "length", "to_lower", "to_upper",
               "strip_edges", "split", "replace", "substr", "find", "is_empty"]
}

# ═══════════════════════════════════════════════════════════════
# CORE / ENTRY POINTS
# ═══════════════════════════════════════════════════════════════

func _init():
    _reset_context()
    var args = OS.get_cmdline_args()
    debug_mode = "--debug-godot" in args

func _reset_context():
    """Reset internal analysis context"""
    _analysis_context = {
        "timestamp": Time.get_unix_time_from_system(),
        "analysis_level": AnalysisLevel.SURFACE,
        "project_path": "",
        "active_scenes": [],
        "behavioral_graph": {},
        "method_calls": {},
        "signal_flows": {}
    }
    _insights_cache.clear()

func get_scene_insights(params: Dictionary) -> Dictionary:
    """Parse scene structure - main MCP entry point"""
    var scene_path = params.get("scene_path", "")
    var include_properties = params.get("include_properties", true)
    var include_connections = params.get("include_connections", true)
    var max_depth = params.get("max_depth", null)
    
    if scene_path.is_empty():
        log_error("Scene path is required")
        return _create_error("Scene path is required", scene_path)
    
    var project_path = _find_project_root(scene_path)
    _analysis_context.project_path = project_path
    
    var base_structure = _parse_scene_file(scene_path, include_properties, include_connections, max_depth)
    if base_structure.has("error") and base_structure["error"] != null:
        return base_structure
    
    return _enhance_scene_with_behavioral_analysis(base_structure, params)

func get_node_insights(params: Dictionary) -> Dictionary:
    """Parse script structure - main MCP entry point"""
    var script_path = params.get("script_path", "")
    var include_dependencies = params.get("include_dependencies", false)
    var include_methods = params.get("include_methods", true)
    var include_variables = params.get("include_variables", true)
    var max_depth = params.get("max_depth", null)
    
    if script_path.is_empty():
        log_error("Script path is required")
        return _create_error("Script path is required", script_path)
    
    var project_path = _find_project_root_from_script(script_path)
    if project_path == null or project_path.is_empty():
        log_error("Could not determine project path for: " + script_path)
        project_path = "res://"
    
    _analysis_context.project_path = project_path
    
    var base_structure = _parse_script_file(script_path, include_dependencies, include_methods, include_variables, max_depth)
    if base_structure == null:
        log_error("Script parsing failed, using fallback structure")
        base_structure = _script_create_fallback_structure(script_path, include_dependencies, include_methods, include_variables, max_depth)
    elif base_structure.has("error"):
        log_error("Script parsing error: " + str(base_structure.error))
    
    var enhanced = base_structure.duplicate(true)
    var enhancement_result = _enhance_script_with_behavioral_analysis(enhanced, params)
    if enhancement_result != null:
        enhanced = enhancement_result
    
    # Add diagnostic metadata
    enhanced["debug"] = ["godot_insights_active", "full_processing_attempted"]
    enhanced["godot_insights_active"] = true
    enhanced["diagnostic_timestamp"] = Time.get_datetime_string_from_system()
    
    if not enhanced.has("behavioral_analysis"):
        enhanced["behavioral_analysis"] = {
            "fallback_analysis": true,
            "enhancement_applied": false,
            "timestamp": Time.get_datetime_string_from_system()
        }
    
    # Remove internal analysis data
    if enhanced.has("method_bodies_for_analysis"):
        enhanced.erase("method_bodies_for_analysis")
    
    return enhanced

# ═══════════════════════════════════════════════════════════════
# SCENE PARSING & ENHANCEMENT
# ═══════════════════════════════════════════════════════════════

func _parse_scene_file(scene_path: String, include_properties: bool, include_connections: bool, max_depth) -> Dictionary:
    """Parse .tscn file into structured hierarchy"""
    if not FileAccess.file_exists(scene_path):
        log_error("Scene file not found: " + scene_path)
        return _create_error("Scene file not found: " + scene_path, scene_path)
    
    var file = FileAccess.open(scene_path, FileAccess.READ)
    if not file:
        log_error("Could not open scene file: " + scene_path)
        return _create_error("Could not open scene file: " + scene_path, scene_path)
    
    var content = file.get_as_text()
    file.close()
    
    if content.is_empty():
        return _create_error("Scene file is empty: " + scene_path, scene_path)
    
    var lines = content.split("\n")
    var nodes = []
    var connections = []
    var ext_resources = {}  # Map ExtResource IDs to paths
    var current_node = null
    var root_node = null
    
    for line_idx in range(lines.size()):
        var line = lines[line_idx].strip_edges()
        
        # Parse external resource references
        if line.begins_with("[ext_resource"):
            var resource_data = _scene_parse_ext_resource(line)
            if resource_data:
                ext_resources[resource_data["id"]] = resource_data["path"]
        
        elif line.begins_with("[node"):
            current_node = _scene_parse_node_declaration(line)
            if current_node:
                nodes.append(current_node)
                # Root node is the one without a parent property
                if not current_node.has("parent"):
                    root_node = current_node
        
        elif current_node and include_properties and not line.is_empty() and not line.begins_with("["):
            _scene_parse_node_property(current_node, line)
        
        elif line.begins_with("[connection") and include_connections:
            var connection = _scene_parse_signal_connection(line)
            if connection:
                connections.append(connection)
    
    var hierarchy = _scene_build_hierarchy(nodes)
    
    if max_depth != null:
        hierarchy = _scene_limit_hierarchy_depth(hierarchy, max_depth)
    
    return {
        "scene_path": scene_path,
        "ext_resources": ext_resources,  # Store resource mapping for script resolution
        "structure": {
            "root_node": root_node,
            "hierarchy": hierarchy,
            "total_nodes": nodes.size(),
            "connections": connections if include_connections else []
        },
        "analysis_options": {
            "include_properties": include_properties,
            "include_connections": include_connections,
            "max_depth": max_depth
        },
        "error": null
    }

func _enhance_scene_with_behavioral_analysis(base_structure: Dictionary, params: Dictionary) -> Dictionary:
    """Enhance scene structure with behavioral analysis"""
    var enhanced = base_structure.duplicate(true)
    
    # Collect and analyze scripts FIRST (so we have data to aggregate)
    var script_data = _scene_collect_and_analyze_scripts(base_structure, params)
    var script_insights = script_data.get("script_insights", {})
    
    # Aggregate behavioral data from all scripts in the scene
    var aggregated_context = _aggregate_insights(script_insights)
    
    # Add behavioral context aggregated from scripts
    enhanced["behavioral_analysis"] = {
        "method_chains": aggregated_context.get("method_chains", []),
        "signal_flows": aggregated_context.get("signal_flows", []),
        "behavioral_patterns": aggregated_context.get("behavioral_patterns", [])
    }
    
    enhanced["behavioral_context"] = aggregated_context.get("behavioral_context", {})
    enhanced["behavioral_flows"] = aggregated_context.get("behavioral_flows", {})
    
    # Add script insights if requested (default true)
    var include_script_insights = params.get("include_script_insights", true)
    if include_script_insights:
        if script_data.has("script_insights"):
            enhanced["script_insights"] = script_data["script_insights"]
        if script_data.has("node_script_mapping"):
            enhanced["node_script_mapping"] = script_data["node_script_mapping"]
    
    # Clean up internal data
    if enhanced.has("ext_resources"):
        enhanced.erase("ext_resources")
    
    return enhanced

func _scene_collect_and_analyze_scripts(base_structure: Dictionary, params: Dictionary) -> Dictionary:
    """Collect unique scripts from scene hierarchy and analyze each one
    
    Returns:
        Dictionary with:
        - script_insights: Dictionary keyed by script path with full analysis
        - node_script_mapping: Array of {node_path, script} mappings
    """
    var script_insights = {}
    var node_script_mapping = []
    var unique_scripts = {}  # Track unique script paths
    var ext_resources = base_structure.get("ext_resources", {})  # Get resource mapping
    
    # Recursively collect scripts from hierarchy
    _scene_collect_scripts_recursively(base_structure.get("structure", {}).get("hierarchy", {}), "", unique_scripts, node_script_mapping, ext_resources)
    
    # Analyze each unique script
    for script_path in unique_scripts.keys():
        var script_analysis = _scene_analyze_script(script_path, params)
        if script_analysis != null and (not script_analysis.has("error") or script_analysis["error"] == null):
            script_insights[script_path] = script_analysis
        else:
            # Log and continue with other scripts on error
            if script_analysis:
                log_error("Script analysis failed for " + script_path + ": " + str(script_analysis.get("error", "Unknown error")))
            script_insights[script_path] = {
                "error": script_analysis.get("error", "Failed to analyze script") if script_analysis else "Script analysis returned null",
                "script_path": script_path
            }
    
    return {
        "script_insights": script_insights,
        "node_script_mapping": node_script_mapping
    }

func _scene_collect_scripts_recursively(node: Dictionary, parent_path: String, unique_scripts: Dictionary, node_script_mapping: Array, ext_resources: Dictionary) -> void:
    """Recursively collect script paths from node hierarchy"""
    if node.is_empty():
        return
    
    var node_name = node.get("name", "")
    var current_path = parent_path + "/" + node_name if not parent_path.is_empty() else node_name
    
    # Check if this node has a script
    if node.has("properties") and node["properties"].has("script"):
        var script_ref = node["properties"]["script"]["value"]
        var script_path = _scene_resolve_script_reference(script_ref, ext_resources)
        if not script_path.is_empty():
            unique_scripts[script_path] = true
            node_script_mapping.append({"node_path": current_path, "script": script_path})
    
    # Recurse into children
    if node.has("children"):
        for child in node["children"]:
            _scene_collect_scripts_recursively(child, current_path, unique_scripts, node_script_mapping, ext_resources)

func _scene_resolve_script_reference(script_ref: String, ext_resources: Dictionary) -> String:
    """Resolve a script reference to a full path
    
    Handles formats like:
    - ExtResource("1_abc123") - uses ext_resources map
    - SubResource("script_abc123") - not supported yet
    - res://path/to/script.gd (direct path)
    """
    var trimmed = script_ref.strip_edges()
    
    # Handle direct res:// paths
    if trimmed.begins_with("res://"):
        return trimmed.trim_suffix("\"").trim_prefix("\"")
    
    # Handle ExtResource references
    if trimmed.begins_with("ExtResource("):
        var regex = RegEx.new()
        regex.compile('ExtResource\\("([^"]+)"\\)')
        var result = regex.search(trimmed)
        if result:
            var resource_id = result.get_string(1)
            if ext_resources.has(resource_id):
                return ext_resources[resource_id]
    
    # SubResource not supported (usually not used for scripts)
    return ""

func _scene_analyze_script(script_path: String, params: Dictionary) -> Dictionary:
    """Analyze a single script file and return full behavioral analysis
    
    This reuses the same logic as get_node_insights but without MCP entry point overhead
    """
    # Parse the script
    var include_dependencies = params.get("include_dependencies", false)
    var include_methods = params.get("include_methods", true)
    var include_variables = params.get("include_variables", true)
    var max_depth = params.get("max_depth", null)
    
    var base_structure = _parse_script_file(script_path, include_dependencies, include_methods, include_variables, max_depth)
    
    if base_structure == null or (base_structure.has("error") and base_structure["error"] != null):
        return base_structure  # Return error
    
    # Enhance with behavioral analysis
    var enhanced = _enhance_script_with_behavioral_analysis(base_structure, params)
    
    # Clean up internal analysis data
    if enhanced.has("method_bodies_for_analysis"):
        enhanced.erase("method_bodies_for_analysis")
    
    return enhanced

func _scene_parse_node_declaration(line: String) -> Dictionary:
    """Extract node metadata from .tscn [node] line"""
    var regex = RegEx.new()
    regex.compile('\\[node name="([^"]+)".*type="([^"]*)"')
    var result = regex.search(line)
    
    if result:
        var node = {
            "name": result.get_string(1),
            "type": result.get_string(2),
            "properties": {}
        }
        
        # Extract parent path if present
        var parent_regex = RegEx.new()
        parent_regex.compile('parent="([^"]*)"')
        var parent_result = parent_regex.search(line)
        if parent_result:
            node["parent"] = parent_result.get_string(1)
        
        return node
    
    return {}

func _scene_parse_ext_resource(line: String) -> Dictionary:
    """Parse external resource line to extract ID and path
    
    Format: [ext_resource type="Script" uid="..." path="res://path/to/script.gd" id="1_abc123"]
    """
    var path_regex = RegEx.new()
    path_regex.compile('path="([^"]+)"')
    var path_result = path_regex.search(line)
    
    var id_regex = RegEx.new()
    id_regex.compile('\\sid="([^"]+)"')  # Use word boundary to match only the id attribute
    var id_result = id_regex.search(line)
    
    if path_result and id_result:
        return {
            "id": id_result.get_string(1),
            "path": path_result.get_string(1)
        }
    
    return {}

func _scene_parse_signal_connection(line: String) -> Dictionary:
    """Extract signal connection from .tscn [connection] line"""
    var regex = RegEx.new()
    regex.compile('signal="([^"]+)".*from="([^"]*)".*to="([^"]*)".*method="([^"]*)"')
    var result = regex.search(line)
    
    if result:
        return {
            "signal": result.get_string(1),
            "from": result.get_string(2),
            "to": result.get_string(3),
            "method": result.get_string(4)
        }
    
    return {}

func _scene_parse_node_property(node: Dictionary, line: String) -> void:
    """Parse a node property from a scene line"""
    if not node.has("properties"):
        node["properties"] = {}
    
    if " = " in line:
        var parts = line.split(" = ", false, 1)
        if parts.size() >= 2:
            var key = parts[0].strip_edges()
            var value = parts[1].strip_edges()
            node["properties"][key] = {
                "value": value,
                "raw": line
            }

func _scene_build_hierarchy(nodes: Array) -> Dictionary:
    """Build hierarchical tree from flat node list using parent references"""
    if nodes.is_empty():
        return {}
    
    # Find root node (node without parent)
    var root = null
    for node in nodes:
        if not node.has("parent"):
            root = node.duplicate(true)
            root["children"] = []
            break
    
    if not root:
        return {}
    
    # Build node lookup map by path
    var node_map = {}
    node_map[root["name"]] = root
    node_map["."] = root  # Root can be referenced as "."
    
    # Process all other nodes and attach to parents
    for node in nodes:
        if not node.has("parent"):
            continue  # Skip root
        
        var parent_path = node.get("parent", "")
        var node_copy = node.duplicate(true)
        node_copy["children"] = []
        
        # Store in map using full path
        var node_path = parent_path + "/" + node["name"] if parent_path != "." else node["name"]
        node_map[node_path] = node_copy
        node_map[node["name"]] = node_copy  # Also store by simple name
        
        # Attach to parent
        if node_map.has(parent_path):
            var parent = node_map[parent_path]
            if not parent.has("children"):
                parent["children"] = []
            parent["children"].append(node_copy)
    
    return root

func _scene_limit_hierarchy_depth(hierarchy: Dictionary, max_depth: int) -> Dictionary:
    """Truncate scene hierarchy to maximum depth"""
    var limited = hierarchy.duplicate()
    if max_depth <= 0:
        limited["children"] = []
    return limited


# ═══════════════════════════════════════════════════════════════
# SCRIPT PARSING & ENHANCEMENT
# ═══════════════════════════════════════════════════════════════

func _parse_script_file(script_path: String, include_dependencies: bool, include_methods: bool, include_variables: bool, max_depth) -> Dictionary:
    """Parse .gd script file into structured data"""
    if not FileAccess.file_exists(script_path):
        log_error("Script file not found: " + script_path)
        return _create_error("Script file not found: " + script_path, script_path)
    
    var file = FileAccess.open(script_path, FileAccess.READ)
    if not file:
        log_error("Could not open script file: " + script_path)
        return _create_error("Could not open script file: " + script_path, script_path)
    
    var content = file.get_as_text()
    file.close()
    
    if content.is_empty():
        return _create_error("Script file is empty: " + script_path, script_path)
    
    # Parse GDScript content
    var lines = content.split("\n")
    var script_data = {
        "class_name": "",
        "extends": "",
        "signals": [],
        "exports": [],
        "variables": [],
        "methods": [],
        "dependencies": []
    }
    
    var current_method = null
    var method_body_lines = []
    # Keep a separate map of body lines for analysis only (not included in output)
    var method_bodies_for_analysis = {}
    var in_function_body := false
    
    for line_idx in range(lines.size()):
        var line = lines[line_idx]
        var stripped = line.strip_edges()
        
        # Parse class definition
        if stripped.begins_with("class_name "):
            script_data.class_name = stripped.substr(11).strip_edges()
        elif stripped.begins_with("extends "):
            script_data.extends = stripped.substr(8).strip_edges()
        
        # Parse signals
        elif stripped.begins_with("signal "):
            var signal_data = _script_parse_signal_declaration(stripped)
            if signal_data:
                script_data.signals.append(signal_data)
        
        # Parse exports
        elif stripped.begins_with("@export"):
            var export_data = _script_parse_export_declaration(line, lines, line_idx)
            if export_data:
                script_data.exports.append(export_data)
        
        # Parse class-level variables
        # Always parse variables when include_methods is true (needed for type checking method calls)
        elif (include_variables or include_methods) and _script_is_variable_declaration(stripped) and not in_function_body:
            var var_data = _script_parse_variable_declaration(line, line_idx + 1)
            if var_data and var_data.has("name") and not String(var_data["name"]).is_empty():
                script_data.variables.append(var_data)
        
        # Parse methods
        elif include_methods and stripped.begins_with("func "):
            # Save previous method if exists
            if current_method:
                # Store body lines for analysis in separate map
                method_bodies_for_analysis[current_method["name"]] = method_body_lines.duplicate()
                script_data.methods.append(current_method)
            
            # Start new method
            current_method = _script_parse_method_declaration(stripped, line_idx + 1)
            method_body_lines = []
            in_function_body = true
        
        # Collect method body (for analysis only)
        elif current_method:
            method_body_lines.append(line)
    
    # Save final method
    if current_method:
        # Store body lines for analysis in separate map
        method_bodies_for_analysis[current_method["name"]] = method_body_lines
        script_data.methods.append(current_method)
        in_function_body = false

    if include_methods:
        script_data["signal_emissions"] = _signals_collect_emissions(method_bodies_for_analysis, script_data.get("methods", []))
    else:
        script_data["signal_emissions"] = []
    
    # Parse dependencies if requested
    if include_dependencies:
        script_data.dependencies = _deps_extract_all(content, script_path, script_data)
    
    return {
        "script_path": script_path,
        "structure": script_data,
        "method_bodies_for_analysis": method_bodies_for_analysis,  # For internal use only
        "analysis_options": {
            "include_dependencies": include_dependencies,
            "include_methods": include_methods,
            "include_variables": include_variables,
            "max_depth": max_depth
        },
        "error": null
    }

func _enhance_script_with_behavioral_analysis(base_structure: Dictionary, params: Dictionary) -> Dictionary:
    """Enhance script structure with behavioral analysis"""
    if base_structure == null:
        log_error("base_structure is null")
        return {}
    
    var enhanced = base_structure.duplicate(true)
    var script_data = enhanced.get("structure")
    
    # Handle null or missing structure
    if script_data == null or typeof(script_data) != TYPE_DICTIONARY:
        log_error("Invalid script_data structure")
        script_data = {}
        enhanced["structure"] = script_data
    
    # Add comprehensive behavioral analysis
    enhanced["behavioral_analysis"] = {
        "pattern_count": script_data.get("methods", []).size(),
        "signal_count": script_data.get("signals", []).size(),
        "variable_count": script_data.get("variables", []).size(),
        "enhancement_applied": true,
    }
    
    # Detect architectural patterns and complexity
    var method_count = script_data.get("methods", []).size()
    var signal_count = script_data.get("signals", []).size()
    var variable_count = script_data.get("variables", []).size()
    
    var complexity = "low"
    if method_count > 20 or variable_count > 30:
        complexity = "high"
    elif method_count > 10 or variable_count > 15:
        complexity = "medium"
    
    # Use shared pattern detection function for consistency
    var pattern_data = _detect_patterns(script_data)
    
    # Detect UI patterns (additional check not in shared function)
    var has_ui_elements = false
    for variable in script_data.get("variables", []):
        var var_type = variable.get("type", "")
        if var_type in ["Button", "Label", "Control", "Node2D", "Node3D", "TextureRect", "Panel"]:
            has_ui_elements = true
            # Add ui_controller pattern if not already present
            if "ui_controller" not in pattern_data["behavioral_patterns"]:
                pattern_data["behavioral_patterns"].append("ui_controller")
            break
    
    # Build behavioral_context with rich format (arrays instead of booleans)
    enhanced["behavioral_context"] = {
        "analysis_timestamp": Time.get_datetime_string_from_system(),
        "script_complexity": complexity,
        "behavioral_patterns": pattern_data["behavioral_patterns"],
        "lifecycle_methods": pattern_data["lifecycle_methods"],
        "event_handler_count": pattern_data["event_handler_count"],
        "signals_defined": pattern_data["signals_defined"],
        "signals_emitted": pattern_data["signals_emitted"],
        "has_state_management": pattern_data["has_state_management"],
        "has_ui_elements": has_ui_elements,
        "variable_types": pattern_data["variable_types"],
        "code_health": {
            "method_to_variable_ratio": float(method_count) / max(1, variable_count),
            "signal_usage_ratio": float(signal_count) / max(1, method_count),
            "has_documentation": false  # Could be enhanced by checking for comments
        }
    }
    
    # Calculate method interaction metrics
    var method_bodies = base_structure.get("method_bodies_for_analysis", {})
    var total_lines_of_code = 0
    var methods_with_conditionals = 0
    var methods_with_loops = 0
    
    for method_name in method_bodies.keys():
        var body = method_bodies[method_name]
        total_lines_of_code += body.size()
        
        for line in body:
            var stripped = line.strip_edges()
            if stripped.begins_with("if ") or stripped.begins_with("elif ") or " if " in stripped:
                methods_with_conditionals += 1
                break
        
        for line in body:
            var stripped = line.strip_edges()
            if stripped.begins_with("for ") or stripped.begins_with("while "):
                methods_with_loops += 1
                break
    
    enhanced["behavioral_flows"] = {
        "detected_patterns": pattern_data["behavioral_patterns"],
        "method_complexity": complexity,
        "signal_usage": "active" if signal_count > 3 else ("moderate" if signal_count > 0 else "minimal"),
        "code_metrics": {
            "total_lines_of_code": total_lines_of_code,
            "average_method_length": total_lines_of_code / max(1, method_count),
            "methods_with_conditionals": methods_with_conditionals,
            "methods_with_loops": methods_with_loops,
            "cyclomatic_complexity_estimate": methods_with_conditionals + methods_with_loops
        }
    }

    var indicator_source := {
        "methods": script_data.get("methods", []),
        "variables": script_data.get("variables", []),
        "signal_connections": script_data.get("signals", []),
        "signal_emissions": script_data.get("signal_emissions", []),
        "external_classes": []
    }
    script_data["structural_indicators"] = _collect_indicators(indicator_source)

    # Add compact method summaries with simple call_profile lists
    # Pass full base_structure so _build_method_summaries can access method_bodies_for_analysis
    var method_summaries = _build_method_summaries(base_structure)
    if not enhanced["behavioral_analysis"].has("method_summaries"):
        enhanced["behavioral_analysis"]["method_summaries"] = method_summaries
    else:
        # If something already populated this key, prefer the richer, merged view
        for summary in method_summaries:
            enhanced["behavioral_analysis"]["method_summaries"].append(summary)
    
    # Analyze scene interactions (node queries, tree manipulation, communication)
    var scene_interactions = _analyze_scene_usage(method_bodies)
    enhanced["behavioral_analysis"]["scene_interactions"] = scene_interactions
    
    # Link upward communication to signal emissions
    var signal_emissions = script_data.get("signal_emissions", [])
    if signal_emissions.size() > 0:
        scene_interactions["communication_patterns"]["upward"] = signal_emissions
    
    return enhanced

func _script_create_fallback_structure(script_path: String, include_dependencies: bool, include_methods: bool, include_variables: bool, max_depth) -> Dictionary:
    """Create minimal structure when script parsing fails"""
    return {
        "analysis_options": {
            "include_dependencies": include_dependencies,
            "include_methods": include_methods, 
            "include_variables": include_variables,
            "max_depth": max_depth
        },
        "error": null,
        "script_path": script_path,
        "structure": {
            "class_name": "FallbackParsing",
            "methods": [],
            "variables": [],
            "signals": [],
            "dependencies": []
        }
    }

func _script_parse_signal_declaration(line: String) -> Dictionary:
    """Parse signal definition from script line"""
    var regex = RegEx.new()
    regex.compile('signal\\s+(\\w+)\\s*\\(([^)]*)\\)')
    var result = regex.search(line)
    
    if result:
        var params = []
        var param_str = result.get_string(2).strip_edges()
        if not param_str.is_empty():
            for param in param_str.split(","):
                params.append(param.strip_edges())
        
        return {
            "name": result.get_string(1),
            "parameters": params
        }
    
    return {}

func _script_parse_export_declaration(line: String, lines: Array = [], line_idx: int = -1) -> Dictionary:
    """Parse @export annotation and variable declaration"""
    var trimmed := line.strip_edges()
    var export_info = {
        "name": "",
        "type": "",
        "default_value": "",
        "is_export": true,
        "line": line
    }
    if line_idx != -1:
        export_info["line_number"] = line_idx + 1
    
    if " var " in trimmed:
        var var_part = trimmed.split(" var ")[1]
        if ":" in var_part:
            var parts = var_part.split(":")
            export_info["name"] = parts[0].strip_edges()
            if parts.size() > 1:
                var type_part = parts[1].strip_edges()
                if " = " in type_part:
                    var type_default = type_part.split(" = ")
                    export_info["type"] = type_default[0].strip_edges()
                    export_info["default_value"] = type_default[1].strip_edges()
                else:
                    export_info["type"] = type_part
    
    return export_info

func _script_is_variable_declaration(line: String) -> bool:
    """Check if line is a variable declaration"""
    var trimmed := line.strip_edges()
    if trimmed.begins_with("var ") or trimmed.begins_with("const "):
        return true
    if trimmed.begins_with("@") and trimmed.find(" var ") != -1:
        return true
    return false

func _script_parse_variable_declaration(line: String, line_number: int = -1) -> Dictionary:
    """Parse variable declaration extracting name, type, default value"""
    var trimmed := line.strip_edges()
    var annotations: Array = []
    var var_info = {
        "name": "",
        "type": "",
        "default_value": "",
        "is_export": false,
        "is_constant": false,
        "is_onready": false,
        "scope": "class",
        "line_number": line_number,
        "annotations": annotations,
        "line": line
    }

    # Extract annotations (@export, @onready, etc.)
    var working_line := trimmed
    while working_line.begins_with("@"):
        var space_idx := working_line.find(" ")
        if space_idx == -1:
            break
        var annotation := working_line.substr(0, space_idx)
        annotations.append(annotation)
        working_line = working_line.substr(space_idx + 1).strip_edges()

    for annotation in annotations:
        if annotation.begins_with("@export"):
            var_info["is_export"] = true
        if annotation == "@onready":
            var_info["is_onready"] = true
    if var_info["is_onready"]:
        var_info["scope"] = "onready"

    # Remove var/const prefix
    if working_line.begins_with("const "):
        var_info["is_constant"] = true
        var_info["scope"] = "const"
        working_line = working_line.substr(6).strip_edges()
    elif working_line.begins_with("var "):
        working_line = working_line.substr(4).strip_edges()
    else:
        var var_pos := working_line.find(" var ")
        if var_pos != -1:
            working_line = working_line.substr(var_pos + 5).strip_edges()
        else:
            return {}

    # Find the colon that denotes type annotation, skipping colons inside string literals
    var colon_idx := _script_find_type_colon(working_line)
    if colon_idx != -1:
        var_info["name"] = working_line.substr(0, colon_idx).strip_edges()
        var after_colon := working_line.substr(colon_idx + 1).strip_edges()
        var type_and_default := _script_parse_assignment(after_colon)
        # Strip inline comments from type field
        var type_str = type_and_default["left"].strip_edges()
        var comment_pos = type_str.find("#")
        if comment_pos != -1:
            type_str = type_str.substr(0, comment_pos).strip_edges()
        var_info["type"] = type_str
        var_info["default_value"] = type_and_default["right"].strip_edges()
    else:
        var name_and_default := _script_parse_assignment(working_line)
        var_info["name"] = name_and_default["left"].strip_edges()
        var_info["default_value"] = name_and_default["right"].strip_edges()
        if name_and_default["operator"] == ":=" and var_info["type"].is_empty():
            var_info["type"] = "inferred"

    return var_info

func _script_parse_method_declaration(signature_line: String, line_number: int = -1) -> Dictionary:
    """Parse function signature extracting name, parameters, return type"""
    var method_info = {
        "name": "",
        "parameters": [],
        "return_type": "",
        "line": signature_line,
        "line_number": line_number
    }

    var stripped := signature_line.strip_edges()
    if not stripped.begins_with("func "):
        return method_info

    var after_func := stripped.substr(5).strip_edges()
    var paren_pos := after_func.find("(")
    
    # Handle methods without parentheses
    if paren_pos == -1:
        var clean_name := after_func
        if clean_name.ends_with(":"):
            clean_name = clean_name.substr(0, clean_name.length() - 1)
        method_info["name"] = clean_name.strip_edges()
        return method_info

    method_info["name"] = after_func.substr(0, paren_pos).strip_edges()
    var close_paren := after_func.find(")", paren_pos)
    var remainder := ""
    
    # Parse parameters
    if close_paren != -1:
        var params_str := after_func.substr(paren_pos + 1, close_paren - paren_pos - 1)
        if not params_str.is_empty():
            var params = params_str.split(",")
            for param in params:
                param = param.strip_edges()
                if param.is_empty():
                    continue
                var param_info := {
                    "name": "",
                    "type": "",
                    "default": ""
                }
                if ":" in param:
                    var parts = param.split(":", false, 1)
                    param_info["name"] = parts[0].strip_edges()
                    var type_part = parts[1].strip_edges()
                    var type_assignment = _script_parse_assignment(type_part)
                    param_info["type"] = type_assignment["left"].strip_edges()
                    param_info["default"] = type_assignment["right"].strip_edges()
                else:
                    var assignment = _script_parse_assignment(param)
                    param_info["name"] = assignment["left"].strip_edges()
                    param_info["default"] = assignment["right"].strip_edges()
                    if assignment["operator"] == ":=" and not param_info["default"].is_empty():
                        param_info["type"] = _script_infer_type_from_literal(param_info["default"])
                    else:
                        param_info["type"] = "inferred"
                method_info["parameters"].append(param_info)
        remainder = after_func.substr(close_paren + 1).strip_edges()
    else:
        remainder = after_func.substr(paren_pos + 1).strip_edges()

    # Parse return type
    var arrow_idx := remainder.find("->")
    if arrow_idx != -1:
        var return_part := remainder.substr(arrow_idx + 2).strip_edges()
        if return_part.begins_with(" "):
            return_part = return_part.strip_edges()
        var colon_pos := return_part.find(":")
        if colon_pos != -1:
            return_part = return_part.substr(0, colon_pos).strip_edges()
        method_info["return_type"] = return_part

    return method_info

func _script_find_type_colon(line: String) -> int:
    """Find the colon that denotes type annotation, ignoring colons inside string literals."""
    var string_char = ""  # Empty = not in string, '"' or "'" = inside that type
    var escape_next = false
    
    for i in range(line.length()):
        var ch = line[i]
        
        if escape_next:
            escape_next = false
            continue
        
        if ch == "\\" and not string_char.is_empty():
            escape_next = true
            continue
        
        if ch in ['"', "'"]:
            if string_char.is_empty():
                string_char = ch  # Enter string
            elif string_char == ch:
                string_char = ""  # Exit string
            continue
        
        # Found a colon outside of string literals
        if ch == ":" and string_char.is_empty():
            # Make sure it's not part of := operator
            if i + 1 < line.length() and line[i + 1] == "=":
                continue
            return i
    
    return -1

func _script_parse_assignment(text: String) -> Dictionary:
    """Split expression by := or = operators"""
    var result = {
        "left": text,
        "right": "",
        "operator": ""
    }
    var operators = [":=", "="]
    for op in operators:
        var idx := text.find(op)
        if idx != -1:
            result["left"] = text.substr(0, idx)
            result["right"] = text.substr(idx + op.length())
            result["operator"] = op
            return result
    return result

func _script_infer_type_from_literal(value: String) -> String:
    """Infer the GDScript type from a literal value string or "Variant" if the type cannot be inferred."""
    var trimmed := String(value).strip_edges()
    if trimmed.is_empty():
        return "Variant"
    
    var lower := trimmed.to_lower()
    var first_char := trimmed.substr(0, 1)
    
    # Check prefix-based literals first
    match first_char:
        "^": return "NodePath"
        "&": return "StringName"
        "\"", "'":
            if trimmed.ends_with(first_char):
                return "String"
        "[":
            if trimmed.ends_with("]"):
                return "Array"
        "{":
            if trimmed.ends_with("}"):
                return "Dictionary"
        "0":
            if trimmed.length() > 1:
                var second_char := trimmed.substr(1, 1).to_lower()
                if second_char == "x" or second_char == "b":
                    return "int"
    
    # Boolean and null literals
    if lower in ["true", "false"]:
        return "bool"
    if lower == "null":
        return "Variant"
    
    # Numeric literals
    if trimmed.is_valid_int():
        return "int"
    if trimmed.is_valid_float():
        return "float"
    
    # Constructor call: Type(args) or Type.new(args)
    var paren_idx := trimmed.find("(")
    if paren_idx > 0 and trimmed.ends_with(")"):
        var type_part := trimmed.substr(0, paren_idx).strip_edges()
        if type_part.ends_with(".new"):
            type_part = type_part.substr(0, type_part.length() - 4).strip_edges()
        if not type_part.is_empty():
            var type_first := type_part.substr(0, 1)
            if type_first == type_first.to_upper() or not "." in type_part:
                return type_part
    
    return "Variant"

func _script_extract_local_var_types(body_lines: Array) -> Dictionary:
    """Extract local variable type declarations from method body lines.
    Parses lines like:
    - var buttons: Array = []
    - var child: Node = get_child(i)
    - var label := Label.new()
    Returns Dictionary mapping variable names to their types.
    """
    var local_types: Dictionary = {}
    
    for line in body_lines:
        var stripped := String(line).strip_edges()
        
        # Skip comments and empty lines
        if stripped.is_empty() or stripped.begins_with("#"):
            continue
        
        # Look for var declarations
        if not stripped.begins_with("var "):
            continue
        
        var after_var := stripped.substr(4).strip_edges()
        
        # Find the variable name and type annotation
        var colon_idx := _script_find_type_colon(after_var)
        if colon_idx != -1:
            var var_name := after_var.substr(0, colon_idx).strip_edges()
            var after_colon := after_var.substr(colon_idx + 1).strip_edges()
            
            # Extract type before = or := if present
            var type_str := ""
            var assign_idx := after_colon.find("=")
            if assign_idx != -1:
                type_str = after_colon.substr(0, assign_idx).strip_edges()
            else:
                type_str = after_colon.strip_edges()
            
            # Remove inline comments
            var comment_idx := type_str.find("#")
            if comment_idx != -1:
                type_str = type_str.substr(0, comment_idx).strip_edges()
            
            if not var_name.is_empty() and not type_str.is_empty():
                local_types[var_name] = type_str
        else:
            # Check for := type inference
            var walrus_idx := after_var.find(":=")
            if walrus_idx != -1:
                var var_name := after_var.substr(0, walrus_idx).strip_edges()
                var after_walrus := after_var.substr(walrus_idx + 2).strip_edges()
                
                # Try to infer type from assignment
                var inferred_type := _script_infer_type_from_literal(after_walrus)
                if not var_name.is_empty() and inferred_type != "Variant":
                    local_types[var_name] = inferred_type
            else:
                # Check for regular = assignment (without type annotation)
                var equals_idx := after_var.find("=")
                if equals_idx != -1:
                    var var_name := after_var.substr(0, equals_idx).strip_edges()
                    var after_equals := after_var.substr(equals_idx + 1).strip_edges()
                    
                    # Try to infer type from assignment
                    var inferred_type := _script_infer_type_from_literal(after_equals)
                    if not var_name.is_empty() and inferred_type != "Variant":
                        local_types[var_name] = inferred_type
    
    return local_types

# ═══════════════════════════════════════════════════════════════
# DEPENDENCY ANALYSIS
# ═══════════════════════════════════════════════════════════════

func _deps_extract_all(content: String, script_path: String = "", script_data: Dictionary = {}) -> Array:
    """Extract all dependencies from script content (extends, preload, load, ClassDB, etc.)"""
    var dependencies: Array = []
    var dedupe: Dictionary = {}
    var lines = content.split("\n")
    var script_class_name: String = script_data.get("class_name", "")
    
    for line_idx in range(lines.size()):
        var raw_line: String = lines[line_idx]
        var stripped_line := raw_line.strip_edges()
        if stripped_line.is_empty():
            continue
        
        if stripped_line.begins_with("extends "):
            var inheritance_target := stripped_line.substr(8).strip_edges()
            var inheritance_path := _strip_quotes(inheritance_target)
            var resolved_path := ""
            if inheritance_path != inheritance_target:
                inheritance_target = inheritance_path
                resolved_path = inheritance_path
            else:
                resolved_path = _deps_resolve_class_path(inheritance_target)
            _deps_register(dependencies, dedupe, inheritance_target, "inheritance", raw_line, resolved_path, line_idx + 1)
            continue
        
        var preload_paths = _deps_extract_function_args(raw_line, "preload", true)
        for path in preload_paths:
            var normalized_path = path.strip_edges()
            var metadata := {
                "resource_type": _deps_infer_resource_type(normalized_path)
            }
            _deps_register(dependencies, dedupe, normalized_path, "preload", raw_line, normalized_path, line_idx + 1, metadata)
        
        var resource_loader_paths = _deps_extract_function_args(raw_line, "ResourceLoader.load", true)
        for path in resource_loader_paths:
            var normalized_resource_path = path.strip_edges()
            var loader_metadata := {
                "resource_type": _deps_infer_resource_type(normalized_resource_path)
            }
            _deps_register(dependencies, dedupe, normalized_resource_path, "load", raw_line, normalized_resource_path, line_idx + 1, loader_metadata)
        
        var load_paths = _deps_extract_function_args(raw_line, "load")
        for path in load_paths:
            var normalized_load_path = path.strip_edges()
            var load_metadata := {
                "resource_type": _deps_infer_resource_type(normalized_load_path)
            }
            _deps_register(dependencies, dedupe, normalized_load_path, "load", raw_line, normalized_load_path, line_idx + 1, load_metadata)
        
        var classdb_calls := []
        classdb_calls.append_array(_deps_extract_function_args(raw_line, "ClassDB.instantiate", true))
        classdb_calls.append_array(_deps_extract_function_args(raw_line, "ClassDB.instance", true))
        classdb_calls.append_array(_deps_extract_function_args(raw_line, "ClassDB.can_instantiate", true))
        for class_name_literal in classdb_calls:
            var literal := String(class_name_literal).strip_edges()
            if literal.is_empty():
                continue
            var resolved_class_path := _deps_resolve_class_path(literal)
            var classdb_metadata := {
                "resource_type": _deps_infer_resource_type(resolved_class_path)
            }
            _deps_register(
                dependencies,
                dedupe,
                literal,
                "classdb_reference",
                raw_line,
                resolved_class_path,
                line_idx + 1,
                classdb_metadata
            )
        
        var class_usages = _deps_extract_class_usages(raw_line, script_class_name)
        for class_name_value in class_usages:
            var resolved_path = _deps_resolve_class_path(class_name_value)
            var class_metadata := {}
            if not resolved_path.is_empty():
                class_metadata["resource_type"] = _deps_infer_resource_type(resolved_path)
            _deps_register(dependencies, dedupe, class_name_value, "class_reference", raw_line, resolved_path, line_idx + 1, class_metadata)

    _deps_append_from_literals(script_data, dependencies, dedupe)
    _deps_append_from_type_hints(script_data, dependencies, dedupe)
    return dependencies

func _deps_append_from_type_hints(script_data: Dictionary, dependencies: Array, dedupe: Dictionary) -> void:
    """Extract dependencies from type hints in variables, exports, methods"""
    if script_data.is_empty():
        return
    var registry = _deps_get_global_registry()
    if registry.is_empty():
        return
    var type_sources: Array = []
    for variable in script_data.get("variables", []):
        type_sources.append({
            "type": str(variable.get("type", "")),
            "line": "var " + String(variable.get("name", "")),
            "line_number": variable.get("line_number", -1)
        })
    for export_var in script_data.get("exports", []):
        type_sources.append({
            "type": str(export_var.get("type", "")),
            "line": "export var " + String(export_var.get("name", "")),
            "line_number": export_var.get("line_number", -1)
        })
    for method in script_data.get("methods", []):
        type_sources.append({
            "type": str(method.get("return_type", "")),
            "line": method.get("line", ""),
            "line_number": method.get("line_number", -1)
        })
        for param in method.get("parameters", []):
            type_sources.append({
                "type": str(param.get("type", "")),
                "line": method.get("line", ""),
                "line_number": method.get("line_number", -1)
            })
    for source in type_sources:
        var type_hint: String = source.get("type", "").strip_edges()
        if type_hint.is_empty():
            continue
        var candidates = _deps_extract_class_candidates(type_hint)
        for candidate in candidates:
            var resolved_path = _deps_resolve_class_path(candidate)
            _deps_register(
                dependencies,
                dedupe,
                candidate,
                "type_hint",
                source.get("line", ""),
                resolved_path,
                source.get("line_number", -1),
                {"resource_type": _deps_infer_resource_type(resolved_path)}
            )

func _deps_append_from_literals(script_data: Dictionary, dependencies: Array, dedupe: Dictionary) -> void:
    """Extract dependencies from literal resource paths in variable defaults"""
    if script_data.is_empty():
        return
    var literal_sources: Array = []
    literal_sources.append_array(script_data.get("variables", []))
    literal_sources.append_array(script_data.get("exports", []))
    for source in literal_sources:
        var default_value: String = String(source.get("default_value", "")).strip_edges()
        if default_value.is_empty():
            continue
        var literal_path := _deps_extract_resource_path(default_value)
        if literal_path.is_empty():
            continue
        var metadata := {
            "resource_type": _deps_infer_resource_type(literal_path),
            "declared_name": String(source.get("name", ""))
        }
        var line_repr := String(source.get("line", "var " + String(source.get("name", ""))))
        _deps_register(
            dependencies,
            dedupe,
            literal_path,
            "literal_resource",
            line_repr,
            literal_path,
            source.get("line_number", -1),
            metadata
        )

func _deps_extract_resource_path(value: String) -> String:
    """Clean and extract resource path from string literals"""
    var trimmed := value.strip_edges()
    if trimmed.is_empty():
        return ""
    if trimmed.begins_with("@") and trimmed.length() > 1:
        trimmed = trimmed.substr(1, trimmed.length() - 1)
    var literal := _strip_quotes(trimmed)
    if literal.is_empty():
        literal = trimmed
    if literal.begins_with("res://") or literal.begins_with("uid://") or literal.begins_with("user://"):
        return literal
    return ""

func _deps_infer_resource_type(path: String) -> String:
    """Infer resource type from file extension"""
    if path.is_empty():
        return ""
    var lower := path.to_lower()
    if lower.ends_with(".gd"):
        return "script"
    if lower.ends_with(".tscn") or lower.ends_with(".scn"):
        return "scene"
    if lower.ends_with(".tres") or lower.ends_with(".res"):
        return "resource"
    if lower.ends_with(".png") or lower.ends_with(".jpg") or lower.ends_with(".jpeg") or lower.ends_with(".webp") or lower.ends_with(".svg") or lower.ends_with(".bmp") or lower.ends_with(".tga") or lower.ends_with(".dds") or lower.ends_with(".exr") or lower.ends_with(".hdr"):
        return "texture"
    if lower.ends_with(".ogg") or lower.ends_with(".wav") or lower.ends_with(".mp3") or lower.ends_with(".aac") or lower.ends_with(".flac") or lower.ends_with(".opus"):
        return "audio"
    if lower.ends_with(".shader") or lower.ends_with(".gdshader"):
        return "shader"
    return path.get_extension()

func _deps_extract_function_args(line: String, function_name: String, allow_dot_prefix: bool = false) -> Array:
    """Extract string literal arguments from function calls (load, preload, etc.)"""
    var paths: Array = []
    var search_from := 0
    while true:
        var idx := line.find(function_name, search_from)
        if idx == -1:
            break
        if idx > 0:
            var prev_char := line.substr(idx - 1, 1)
            if _is_identifier_char(prev_char) or (prev_char == "." and not allow_dot_prefix):
                search_from = idx + function_name.length()
                continue
        var cursor := idx + function_name.length()
        while cursor < line.length():
            var char := line.substr(cursor, 1)
            if _is_whitespace(char):
                cursor += 1
                continue
            break
        if cursor >= line.length() or line.substr(cursor, 1) != "(":
            search_from = idx + function_name.length()
            continue
        var open_paren := cursor
        var quote_char := ""
        var quote_start := -1
        for pos in range(open_paren + 1, line.length()):
            var current_char := line.substr(pos, 1)
            if quote_char.is_empty():
                if current_char == "\"" or current_char == "'":
                    quote_char = current_char
                    quote_start = pos + 1
                elif current_char == ")":
                    break
            else:
                if current_char == quote_char and line.substr(pos - 1, 1) != "\\":
                    var path = line.substr(quote_start, pos - quote_start)
                    paths.append(path)
                    break
        search_from = open_paren + 1
    return paths

func _deps_extract_class_usages(line: String, script_class_name: String) -> Array:
    """Extract registered class names used in line (excluding self)"""
    var registry = _deps_get_global_registry()
    if registry.is_empty():
        return []
    var usages: Array = []
    var tokens = _tokenize_identifiers(line)
    for token in tokens:
        if token == script_class_name:
            continue
        if not registry.has(token):
            continue
        var search_idx := line.find(token)
        while search_idx != -1:
            var before_char := ""
            if search_idx > 0:
                before_char = line.substr(search_idx - 1, 1)
            if not before_char.is_empty() and _is_identifier_char(before_char):
                search_idx = line.find(token, search_idx + token.length())
                continue
            var after_idx = search_idx + token.length()
            var next_char := _next_non_whitespace(line, after_idx)
            if next_char == "." or next_char == "(":
                usages.append(token)
                break
            search_idx = line.find(token, search_idx + token.length())
    return usages

func _deps_extract_class_candidates(type_hint: String) -> Array:
    """Extract all registered class names from type hint expression"""
    var registry = _deps_get_global_registry()
    if registry.is_empty():
        return []
    var candidates: Array = []
    var tokens = _tokenize_identifiers(type_hint)
    for token in tokens:
        if registry.has(token) and token not in candidates:
            candidates.append(token)
    return candidates

func _tokenize_identifiers(text: String) -> Array:
    var tokens: Array = []
    var current := ""
    for i in range(text.length()):
        var char := text.substr(i, 1)
        if _is_identifier_char(char):
            current += char
        else:
            if not current.is_empty():
                tokens.append(current)
                current = ""
    if not current.is_empty():
        tokens.append(current)
    return tokens

func _deps_register(
    dependencies: Array,
    dedupe: Dictionary,
    target: String,
    dep_type: String,
    line: String,
    resolved_path: String = "",
    line_number: int = -1,
    metadata: Dictionary = {}
) -> void:
    """Register unique dependency entry with deduplication"""
    var normalized_target := target.strip_edges()
    if normalized_target.is_empty():
        return
    var key := dep_type + "::" + normalized_target + "::" + str(line_number)
    if dedupe.has(key):
        return
    var entry = {
        "target": normalized_target,
        "type": dep_type,
        "line": line
    }
    if line_number != -1:
        entry["line_number"] = line_number
    if not resolved_path.is_empty():
        entry["resolved_path"] = resolved_path
    if not metadata.is_empty():
        entry["metadata"] = metadata
    dependencies.append(entry)
    dedupe[key] = true

func _deps_resolve_class_path(class_name_value: String) -> String:
    """Resolve registered class name to its script path"""
    if class_name_value.is_empty():
        return ""
    var registry = _deps_get_global_registry()
    if not registry.has(class_name_value):
        return ""
    return registry[class_name_value].get("path", "")

func _deps_get_global_registry() -> Dictionary:
    """Load and cache global class registry from ProjectSettings"""
    if not _global_class_registry_loaded:
        _global_class_registry.clear()
        var global_classes = ProjectSettings.get_global_class_list()
        for entry in global_classes:
            var class_name_value = entry.get("class", "")
            if class_name_value.is_empty():
                continue
            _global_class_registry[class_name_value] = entry
        _global_class_registry_loaded = true
    return _global_class_registry

# ═══════════════════════════════════════════════════════════════
# SIGNAL EXTRACTION
# ═══════════════════════════════════════════════════════════════

func _signals_parse_string_literals(line: String) -> Array:
    """Extract signal names from quoted string literals in the provided line."""
    var signals: Array = []
    var in_string := false
    var escape_next := false
    var current := ""

    for i in range(line.length()):
        var ch := line.substr(i, 1)
        if escape_next:
            # Preserve escaped characters in the captured literal but avoid
            # treating the following character as a control delimiter.
            current += ch
            escape_next = false
            continue
        
        if ch == "\\":
            if in_string:
                escape_next = true
            continue
        
        if ch == '"':
            if in_string:
                if not current.is_empty():
                    signals.append(current)
                current = ""
                in_string = false
            else:
                in_string = true
            continue
        
        if in_string:
            current += ch
    
    return signals

func _signals_collect_emissions(method_bodies: Dictionary, methods: Array) -> Array:
    var emissions: Array = []
    for method in methods:
        var method_name: String = method.get("name", "")
        var base_line: int = method.get("line_number", 0)
        var body_lines: Array = method_bodies.get(method_name, [])
        for i in range(body_lines.size()):
            var raw_line: String = str(body_lines[i])
            var stripped: String = raw_line.strip_edges()
            if stripped.is_empty() or stripped.begins_with("#"):
                continue
            if not (".emit(" in stripped or "emit_signal(" in stripped):
                continue
            var signal_names: Array = _signals_extract_from_line(stripped)
            for signal_name in signal_names:
                var normalized := String(signal_name).strip_edges()
                if normalized.is_empty():
                    continue
                emissions.append({
                    "method": method_name,
                    "signal": normalized,
                    "line_number": base_line + i + 1,
                    "line": stripped
                })
    return emissions

func _signals_extract_connections(content: String) -> Array:
    """Extract signal connection calls from script content"""
    var connections = []
    var lines = content.split("\n")
    
    for i in range(lines.size()):

        var line = lines[i].strip_edges()
        
        if ".connect(" in line:
            var connect_pos = line.find(".connect(")
            var signal_start = line.rfind(".", connect_pos - 1)
            if signal_start >= 0:
                var signal_name = line.substr(signal_start + 1, connect_pos - signal_start - 1)
                var object_end = signal_start
                var object_start = object_end - 1
                
                while object_start >= 0 and (line[object_start].is_valid_identifier() or line[object_start] == "$"):
                    object_start -= 1
                object_start += 1
                
                if object_start < object_end:
                    var source_object = line.substr(object_start, object_end - object_start)
                    connections.append({
                        "signal_name": signal_name,
                        "source_object": source_object,
                        "target_method": "",
                        "target_object": "self",
                        "type": "connection",
                        "line_number": i + 1,
                        "line_content": line
                    })
    
    return connections

func _signals_extract_from_line(line: String) -> Array:
    """Extract signal names from .emit() or emit_signal() calls"""
    var signal_names = []
    
    # Handle .emit( pattern
    var search_pos = 0
    while true:
        var emit_pos = line.find(".emit(", search_pos)
        if emit_pos == -1:
            break
        
        # Find the signal name BEFORE .emit( by looking backwards
        var signal_end = emit_pos
        var signal_start = signal_end - 1
        
        # Move backwards to find the start of the identifier
        while signal_start >= 0:
            var ch = line[signal_start]
            if ch in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_":
                signal_start -= 1
            else:
                signal_start += 1  # Move forward one as we went one too far
                break
        
        # Handle case where we reached the beginning of the line
        if signal_start < 0:
            signal_start = 0
        
        if signal_start < signal_end:
            var signal_name = line.substr(signal_start, signal_end - signal_start)
            # Only add if we got a valid identifier
            if not signal_name.is_empty() and signal_name[0] in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_":
                signal_names.append(signal_name)
        
        search_pos = emit_pos + 1
    
    # Handle emit_signal( pattern
    search_pos = 0
    while true:
        var emit_sig_pos = line.find("emit_signal(", search_pos)
        if emit_sig_pos == -1:
            break
        
        # Find the first string argument (the signal name)
        var paren_pos = line.find("(", emit_sig_pos)
        if paren_pos != -1:
            var after_paren = line.substr(paren_pos + 1).strip_edges()
            # Extract the first quoted string
            if after_paren.begins_with('"'):
                var end_quote = after_paren.find('"', 1)
                if end_quote != -1:
                    var signal_name = after_paren.substr(1, end_quote - 1)
                    if not signal_name.is_empty():
                        signal_names.append(signal_name)
        
        search_pos = emit_sig_pos + 1
    
    return signal_names

# ═══════════════════════════════════════════════════════════════
# BEHAVIORAL ANALYSIS
# ═══════════════════════════════════════════════════════════════

func _build_method_summaries(base_structure: Dictionary) -> Array:
    """Build compact per-method summaries with simple call_profile lists.

    call_profile structure (per method):
    {
        "internal_methods": ["some_internal_method"],
        "external_methods": ["ObjectName.method_name"],
        "builtin_methods": ["print", "max", "is_empty"],
        "signals": ["signal_name"]
    }
    """
    var summaries: Array = []
    var script_data: Dictionary = base_structure.get("structure", {})
    var method_bodies: Dictionary = base_structure.get("method_bodies_for_analysis", {})
    var methods: Array = script_data.get("methods", [])
    
    # Build variable type registry from parsed data
    var variable_types: Dictionary = {}
    
    # Add class-level variables
    for variable in script_data.get("variables", []):
        var var_name: String = variable.get("name", "")
        var var_type: String = variable.get("type", "")
        if not var_name.is_empty() and not var_type.is_empty() and var_type != "inferred":
            variable_types[var_name] = var_type
    
    # Add exports
    for export_var in script_data.get("exports", []):
        var export_name: String = export_var.get("name", "")
        var export_type: String = export_var.get("type", "")
        if not export_name.is_empty() and not export_type.is_empty():
            variable_types[export_name] = export_type
    
    # Add signals (always type Signal)
    for signal_def in script_data.get("signals", []):
        var signal_name: String = signal_def.get("name", "")
        if not signal_name.is_empty():
            variable_types[signal_name] = "Signal"

    for method in methods:
        var name: String = method.get("name", "")
        var line_number: int = method.get("line_number", 0)  # Use line_number field instead of parsing "line"
        var body_lines: Array = method_bodies.get(name, [])
        
        # Build method-scoped type registry (parameters shadow class variables)
        var method_variable_types: Dictionary = variable_types.duplicate()
        for param in method.get("parameters", []):
            var param_name: String = param.get("name", "")
            var param_type: String = param.get("type", "")
            if not param_name.is_empty() and not param_type.is_empty() and param_type != "inferred":
                method_variable_types[param_name] = param_type
        
        # Extract local variable types from method body
        var local_var_types: Dictionary = _script_extract_local_var_types(body_lines)
        for local_name in local_var_types.keys():
            method_variable_types[local_name] = local_var_types[local_name]

        # Use existing enhanced method call extraction when available
        var enhanced_calls: Array = []
        var has_extract_method = has_method("_behavior_extract_method_calls")
        if has_extract_method:
            var method_with_body = method.duplicate()
            method_with_body["body_lines"] = body_lines
            enhanced_calls = _behavior_extract_method_calls(method_with_body)

        var internal_set: Dictionary = {}
        var external_set: Dictionary = {}
        var builtin_set: Dictionary = {}
        var signal_set: Dictionary = {}

        # Build set of method names defined in this script for quick lookup
        var script_method_names: Dictionary = {}
        for script_method in methods:
            var script_method_name: String = script_method.get("name", "")
            if not script_method_name.is_empty():
                script_method_names[script_method_name] = true
        
        # Derive internal/external/builtin methods from enhanced_calls
        for call in enhanced_calls:
            var call_type: String = call.get("call_type", "")
            if call_type == "internal":
                var internal_name: String = call.get("method_name", "")
                if not internal_name.is_empty():
                    # Check if this method is actually defined in the current script
                    if script_method_names.has(internal_name):
                        internal_set[internal_name] = true
                    else:
                        # Not defined in script - assume builtin (GDScript function or engine method)
                        # This handles: print(), pow(), range(), etc. without maintaining hardcoded lists
                        builtin_set[internal_name] = true
            elif call_type == "external":
                var object_name: String = call.get("object", "")
                var method_name: String = call.get("method_name", "")
                var full_name := ""
                if not object_name.is_empty() and not method_name.is_empty():
                    full_name = object_name + "." + method_name
                elif not method_name.is_empty():
                    full_name = method_name
                if not full_name.is_empty():
                    # Check if this is a builtin method/function - pass method-scoped types
                    if _behavior_is_builtin_call(full_name, method_variable_types):
                        builtin_set[full_name] = true
                    else:
                        external_set[full_name] = true

        # Scan body lines for signal usage
        for i in range(body_lines.size()):
            var raw_line: String = str(body_lines[i])
            var stripped: String = raw_line.strip_edges()
            
            # Very lightweight detection of emit patterns; we only need signal names
            if ".emit(" in stripped or "emit_signal(" in stripped:
                var extracted_signals: Array = _signals_extract_from_line(stripped)
                for s in extracted_signals:
                    if not String(s).is_empty():
                        signal_set[String(s)] = true

        var summary: Dictionary = {
            "name": name,
            "line": line_number,
            "call_profile": {
                "internal_methods": internal_set.keys(),
                "external_methods": external_set.keys(),
                "builtin_methods": builtin_set.keys(),
                "signals": signal_set.keys()
            }
        }

        summaries.append(summary)

    return summaries

func _behavior_is_builtin_call(method_call: String, variable_types: Dictionary = {}) -> bool:
    """Check if method call is Godot builtin (uses ClassDB + type registry)"""
    # Check if it contains a dot (object.method pattern)
    if "." in method_call:
        var parts = method_call.split(".", false, 1)
        if parts.size() == 2:
            var object_part = parts[0]
            var method_part = parts[1]
            
            # Instance variable calling method - always external (not builtin)
            if variable_types.has(object_part):
                return false
            
            # Check if object_part itself is a registered class (static method call)
            if ClassDB.class_exists(object_part):
                if ClassDB.class_has_method(object_part, method_part):
                    return true
                if method_part == "new":
                    return true
            
            # Check if it's a global class constructor (custom classes registered via class_name)
            var registry = _deps_get_global_registry()
            if not registry.is_empty() and registry.has(object_part):
                if method_part == "new":
                    return true
            
            # Check primitive types with predefined methods
            if _PRIMITIVE_METHODS.has(object_part):
                if method_part in _PRIMITIVE_METHODS[object_part]:
                    return true
            
            # Check PackedArray types (all share same methods)
            if object_part in _PRIMITIVE_TYPES:
                # PackedByteArray has one additional method
                if object_part == "PackedByteArray" and method_part == "to_byte_array":
                    return true
                # All packed arrays share common methods
                if method_part in _PACKED_ARRAY_METHODS:
                    return true
    
    return false

func _collect_indicators(behavioral_data: Dictionary) -> Dictionary:
    """Collect structural metrics about script organization"""
    var indicators = {
        "frame_processing_methods": [],
        "event_handler_count": 0,
        "signal_connection_count": behavioral_data.get("signal_connections", []).size(),
        "signal_emission_count": behavioral_data.get("signal_emissions", []).size(),
        "external_classes": behavioral_data.get("external_classes", []),
        "external_class_count": behavioral_data.get("external_classes", []).size(),
        "state_variable_count": 0
    }
    
    for method in behavioral_data.get("methods", []):
        var method_name = method.get("name", "")
        if method_name in ["_process", "_physics_process", "_ready"]:
            if method_name not in indicators["frame_processing_methods"]:
                indicators["frame_processing_methods"].append(method_name)
        if method_name.begins_with("_on_"):
            indicators["event_handler_count"] += 1
    
    for variable in behavioral_data.get("variables", []):
        var var_name = variable.get("name", "").to_lower()
        if "state" in var_name or "mode" in var_name or "phase" in var_name:
            indicators["state_variable_count"] += 1
    
    return indicators

func _aggregate_insights(script_insights: Dictionary) -> Dictionary:
    """Aggregate behavioral data from all analyzed scripts in a scene"""
    var all_patterns = {}
    var all_lifecycle = {}
    var all_signals_defined = []
    var all_signals_emitted = []
    var total_event_handlers = 0
    var has_any_state_mgmt = false
    var total_vars = {"regular": 0, "exported": 0, "onready": 0, "constant": 0}
    
    var all_method_chains = []
    var all_signal_propagation = []
    var complexity_scores = []
    
    # Aggregate from each script
    for script_path in script_insights.keys():
        var script = script_insights[script_path]
        var context = script.get("behavioral_context", {})
        var flows = script.get("behavioral_flows", {})
        var structure = script.get("structure", {})
        
        # Aggregate patterns - use new field name
        for pattern in context.get("behavioral_patterns", []):
            all_patterns[pattern] = true
        
        # Aggregate lifecycle methods - read from new array field
        for method_name in context.get("lifecycle_methods", []):
            all_lifecycle[method_name] = true
        
        # Aggregate signals - read from context (already has actual names)
        for signal_name in context.get("signals_defined", []):
            if not signal_name.is_empty() and signal_name not in all_signals_defined:
                all_signals_defined.append(signal_name)
        
        for signal_name in context.get("signals_emitted", []):
            if not signal_name.is_empty() and signal_name not in all_signals_emitted:
                all_signals_emitted.append(signal_name)
        
        # Aggregate metrics - read from new field
        total_event_handlers += context.get("event_handler_count", 0)
        if context.get("has_state_management", false):
            has_any_state_mgmt = true
        
        # Count variable types - now available in context
        var var_types = context.get("variable_types", {})
        total_vars["constant"] += var_types.get("constant", 0)
        total_vars["exported"] += var_types.get("exported", 0)
        total_vars["onready"] += var_types.get("onready", 0)
        total_vars["regular"] += var_types.get("regular", 0)
        
        # Aggregate flows
        for chain in flows.get("method_chains", []):
            all_method_chains.append(chain)
        for prop in flows.get("signal_propagation", []):
            all_signal_propagation.append(prop)
        
        var complexity = context.get("script_complexity", "low")
        complexity_scores.append(complexity)
    
    # Determine overall complexity
    var overall_complexity = "low"
    var high_count = complexity_scores.count("high")
    var medium_count = complexity_scores.count("medium")
    if high_count > 0:
        overall_complexity = "high"
    elif medium_count > 0:
        overall_complexity = "medium"
    
    return {
        "behavioral_context": {
            "behavioral_patterns": all_patterns.keys(),
            "lifecycle_methods": all_lifecycle.keys(),
            "event_handler_count": total_event_handlers,
            "signals_defined": all_signals_defined,
            "signals_emitted": all_signals_emitted,
            "has_state_management": has_any_state_mgmt,
            "variable_types": total_vars
        },
        "behavioral_flows": {
            "method_chains": all_method_chains,
            "signal_propagation": all_signal_propagation,
            "complexity_metrics": {
                "complexity_score": overall_complexity,
                "script_count": script_insights.size(),
                "total_event_handlers": total_event_handlers
            }
        },
        "behavioral_patterns": all_patterns.keys(),
        "method_chains": all_method_chains,
        "signal_flows": all_signal_propagation
    }

func _detect_patterns(script_data: Dictionary) -> Dictionary:
    """Detect behavioral patterns in a script based on its structure and content"""
    var methods = script_data.get("methods", [])
    var variables = script_data.get("variables", [])
    var signals = script_data.get("signals", [])
    var signal_emissions = script_data.get("signal_emissions", [])
    
    # Detect behavioral patterns with rich data
    var patterns = []
    var has_ready = false
    var has_process = false
    var has_physics = false
    var has_input = false
    var event_handler_count = 0
    var lifecycle_methods = []
    
    # Analyze methods for lifecycle and event handlers
    for method in methods:
        var method_name = method.get("name", "")
        if method_name == "_ready":
            has_ready = true
            lifecycle_methods.append("_ready")
        elif method_name == "_process":
            has_process = true
            lifecycle_methods.append("_process")
        elif method_name == "_physics_process":
            has_physics = true
            lifecycle_methods.append("_physics_process")
        elif method_name in ["_input", "_unhandled_input", "_gui_input"]:
            has_input = true
            lifecycle_methods.append(method_name)
        elif method_name.begins_with("_on_"):
            event_handler_count += 1
    
    # Build pattern names based on detected features
    if has_ready: 
        patterns.append("initialization")
    if has_process or has_physics: 
        patterns.append("continuous_processing")
    if has_input: 
        patterns.append("input_handling")
    if event_handler_count > 0: 
        patterns.append("event_driven")
    if signals.size() > 0: 
        patterns.append("signal_emitter")
    if signal_emissions.size() > 0: 
        patterns.append("signal_emitting_active")
    
    # Detect state management patterns
    var has_state_vars = false
    for variable in variables:
        var var_name = variable.get("name", "")
        if "state" in var_name.to_lower() or "status" in var_name.to_lower() or "mode" in var_name.to_lower():
            has_state_vars = true
            break
    if has_state_vars: 
        patterns.append("state_management")
    
    # Extract signal information (actual names, not just count)
    var signals_defined = []
    for signal_def in signals:
        var signal_name = signal_def.get("name", "")
        if not signal_name.is_empty():
            signals_defined.append(signal_name)
    
    var signals_emitted = []
    for emission in signal_emissions:
        var signal_name = emission.get("signal", "")
        if signal_name and signal_name not in signals_emitted:
            signals_emitted.append(signal_name)
    
    # Count variable types
    var variable_types = {
        "exported": variables.filter(func(v): return v.get("is_export", false)).size(),
        "onready": variables.filter(func(v): return v.get("is_onready", false)).size(),
        "constant": variables.filter(func(v): return v.get("is_constant", false)).size(),
        "regular": variables.filter(func(v): return not v.get("is_export", false) and not v.get("is_onready", false) and not v.get("is_constant", false)).size()
    }
    
    return {
        "behavioral_patterns": patterns,
        "lifecycle_methods": lifecycle_methods,
        "event_handler_count": event_handler_count,
        "signals_defined": signals_defined,
        "signals_emitted": signals_emitted,
        "has_state_management": has_state_vars,
        "variable_types": variable_types
    }

func _analyze_scene_usage(method_bodies: Dictionary) -> Dictionary:
    """Analyze how the script interacts with scene nodes - always enabled for Node scripts
    
    Detects:
    - Node queries: $NodePath, %UniqueName, get_node()
    - Tree manipulation: add_child, remove_child, queue_free, reparent
    - Scene loading: load(), preload(), instantiate()
    - Communication: method calls on node references, signal connections
    """
    var interactions = {
        "node_queries": [],
        "tree_manipulation": [],
        "scene_loading": [],
        "signal_connections": [],  # Signal .connect() calls
        "communication_patterns": {
            "upward": [],     # Populated from existing signal_emissions
            "downward": []    # Method calls on node references
        }
    }
    
    for method_name in method_bodies.keys():
        var body_lines = method_bodies[method_name]
        for line in body_lines:
            var trimmed = line.strip_edges()
            # Skip comments and empty lines
            if trimmed.is_empty() or trimmed.begins_with("#"):
                continue
            
            _detect_node_queries(trimmed, interactions)
            _detect_tree_changes(trimmed, interactions)
            _detect_scene_loading(trimmed, interactions)
            _detect_node_calls(trimmed, interactions)
            _detect_signal_connects(trimmed, interactions)
    
    # Deduplicate results
    interactions["node_queries"] = _deduplicate_array(interactions["node_queries"])
    interactions["tree_manipulation"] = _deduplicate_array(interactions["tree_manipulation"])
    interactions["scene_loading"] = _deduplicate_array(interactions["scene_loading"])
    interactions["signal_connections"] = _deduplicate_array(interactions["signal_connections"])
    interactions["communication_patterns"]["downward"] = _deduplicate_array(interactions["communication_patterns"]["downward"])
    
    return interactions

func _detect_node_queries(line: String, interactions: Dictionary) -> void:
    """Detect $NodePath, %UniqueName, get_node() patterns"""
    # Pattern 1: $NodePath syntax
    var dollar_regex = RegEx.new()
    dollar_regex.compile("\\$[A-Za-z_][A-Za-z0-9_/]*")
    for match in dollar_regex.search_all(line):
        interactions["node_queries"].append(match.get_string())
    
    # Pattern 2: %UniqueName syntax
    var unique_regex = RegEx.new()
    unique_regex.compile("%[A-Za-z_][A-Za-z0-9_]*")
    for match in unique_regex.search_all(line):
        interactions["node_queries"].append(match.get_string())
    
    # Pattern 3: get_node("path") calls
    if "get_node(" in line:
        var get_node_regex = RegEx.new()
        get_node_regex.compile("get_node\\s*\\(\\s*[\"']([^\"']+)[\"']")
        for match in get_node_regex.search_all(line):
            interactions["node_queries"].append("get_node(\"" + match.get_string(1) + "\")")

func _detect_tree_changes(line: String, interactions: Dictionary) -> void:
    """Detect add_child, remove_child, queue_free, reparent calls"""
    var patterns = [
        "add_child(", "remove_child(", "queue_free(", "reparent("
    ]
    for pattern in patterns:
        if pattern in line:
            # Extract context (simple approach - just record the pattern found)
            var context = _extract_call_context(line, pattern)
            if not context.is_empty():
                interactions["tree_manipulation"].append(context)

func _detect_scene_loading(line: String, interactions: Dictionary) -> void:
    """Detect scene loading patterns: load(), preload(), instantiate()"""
    # Pattern 1: load("res://path.tscn")
    if 'load("res://' in line and ".tscn" in line:
        var load_regex = RegEx.new()
        load_regex.compile('load\\s*\\(\\s*"(res://[^"]*\\.tscn)"')
        for match in load_regex.search_all(line):
            interactions["scene_loading"].append("load(\"" + match.get_string(1) + "\")")
    
    # Pattern 2: preload("res://path.tscn")
    if 'preload("res://' in line and ".tscn" in line:
        var preload_regex = RegEx.new()
        preload_regex.compile('preload\\s*\\(\\s*"(res://[^"]*\\.tscn)"')
        for match in preload_regex.search_all(line):
            interactions["scene_loading"].append("preload(\"" + match.get_string(1) + "\")")
    
    # Pattern 3: .instantiate()
    if ".instantiate(" in line:
        interactions["scene_loading"].append("instantiate()")

func _detect_node_calls(line: String, interactions: Dictionary) -> void:
    """Detect method calls on node references (downward communication)"""
    # Pattern: $Node.method() or get_node().method() or %Unique.method()
    var comm_regex = RegEx.new()
    comm_regex.compile("(\\$[A-Za-z_][A-Za-z0-9_/]*|%[A-Za-z_][A-Za-z0-9_]*|get_node\\([^)]+\\))\\.[a-z_][a-z0-9_]*\\(")
    for match in comm_regex.search_all(line):
        var call = match.get_string()
        # Clean up trailing parenthesis
        if call.ends_with("("):
            call = call.substr(0, call.length() - 1) + "()"
        interactions["communication_patterns"]["downward"].append(call)

func _detect_signal_connects(line: String, interactions: Dictionary) -> void:
    """Detect signal .connect() calls"""
    if ".connect(" not in line:
        return
    
    # Pattern: object.signal_name.connect(callable) or signal_name.connect(callable)
    var connect_regex = RegEx.new()
    connect_regex.compile("([a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z_][a-zA-Z0-9_]*)*)\\.connect\\s*\\(")
    for match in connect_regex.search_all(line):
        var signal_ref = match.get_string(1)
        interactions["signal_connections"].append(signal_ref + ".connect()")

func _behavior_extract_method_calls(method: Dictionary) -> Array:
    """Extract detailed method calls with enhanced context"""
    var method_calls = []
    var method_name = method.get("name", "")
    var body_lines = method.get("body_lines", [])
    var base_line = method.get("line_number", 0)
    
    for i in range(body_lines.size()):
        var line = body_lines[i]
        var stripped = line.strip_edges()
        var line_number = base_line + i + 1
        
        if stripped.is_empty() or stripped.begins_with("#"):
            continue
        
        if not "(" in stripped:
            continue
        
        # Extract object.method() calls (with dot notation)
        if "." in stripped:
            var regex = RegEx.new()
            regex.compile('([$%]?[a-zA-Z_][a-zA-Z0-9_]*)\\s*\\.\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(')
            var matches = regex.search_all(stripped)
            
            for match in matches:
                var obj_name = match.get_string(1)
                var method_call_name = match.get_string(2)
                
                method_calls.append({
                    "method_name": method_call_name,
                    "object": obj_name,
                    "line_number": line_number,
                    "line_content": stripped,
                    "call_type": "external",
                    "call_context": "object_method",
                    "complexity_factor": 2
                })
        
        # ALWAYS extract simple function() calls (regardless of dots in line)
        # This catches cases like: return 1.0 - pow(1.0 - x, 3)
        var regex = RegEx.new()
        regex.compile('\\b([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(')
        var matches = regex.search_all(stripped)
        
        for match in matches:
            var method_call_name = match.get_string(1)
            
            # Skip GDScript keywords reference: https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html#keywords
            const GDSCRIPT_KEYWORDS = ["if", "elif", "else", "for", "while", "match", "when", "break", 
                "continue", "pass", "return", "var", "const", "func", "class", "class_name", 
                "extends", "signal", "enum", "static", "await", "super", "as", "in", "is", 
                "self", "not", "and", "or", "assert", "breakpoint", "preload", "yield", "void", 
                "PI", "TAU", "INF", "NAN"]
            
            if method_call_name in GDSCRIPT_KEYWORDS:
                continue
            
            method_calls.append({
                    "method_name": method_call_name,
                    "object": "self",
                    "line_number": line_number,
                    "line_content": stripped,
                    "call_type": "internal",
                    "call_context": "direct_call",
                    "complexity_factor": 1
                })
    
    return method_calls

# ═══════════════════════════════════════════════════════════════
# UTILITY / HELPERS
# ═══════════════════════════════════════════════════════════════

func _create_error(error_message: String, path: String = "") -> Dictionary:
    """Create standardized error result dictionary"""
    return {
        "scene_path": path,
        "script_path": path,
        "structure": null,
        "error": error_message,
        "analysis_options": {}
    }

func _find_project_root(file_path: String) -> String:
    """Extract project directory from file path by locating project.godot"""
    var path_parts = file_path.split("/")
    for i in range(path_parts.size() - 1, -1, -1):
        var test_path = "/".join(path_parts.slice(0, i + 1))
        if FileAccess.file_exists(test_path + "/project.godot"):
            return test_path
    return ""

func _find_project_root_from_script(script_path: String) -> String:
    var path = script_path
    var max_depth = 10  # Prevent infinite loops
    
    for i in range(max_depth):
        var dir = path.get_base_dir()
        if dir == path:  # Reached filesystem root
            break
        if FileAccess.file_exists(dir + "/project.godot"):
            return dir
        path = dir
    
    return ""

func _deduplicate_array(arr: Array) -> Array:
    """Simple deduplication preserving order"""
    var seen = {}
    var result = []
    for item in arr:
        if not seen.has(item):
            seen[item] = true
            result.append(item)
    return result

func _extract_call_context(line: String, pattern: String) -> String:
    """Extract simple context around a pattern for tree manipulation"""
    var idx = line.find(pattern)
    if idx == -1:
        return ""
    # Find what comes before the pattern (usually object/variable name)
    var before = line.substr(0, idx).strip_edges()
    var words = before.split(" ")
    var target = words[words.size() - 1] if words.size() > 0 else ""
    # Handle direct calls like "add_child(bullet)"
    if target.is_empty() or target in ["=", "var", "if", "while", "for", "return"]:
        return pattern.trim_suffix("(")
    return target + "." + pattern.trim_suffix("(")

func _strip_quotes(text: String) -> String:
    if text.length() >= 2:
        var first = text.substr(0, 1)
        var last = text.substr(text.length() - 1, 1)
        if (first == "\"" and last == "\"") or (first == "'" and last == "'"):
            return text.substr(1, text.length() - 2)
    return text

func _is_identifier_char(char: String) -> bool:
    if char.is_empty():
        return false
    var code = char.unicode_at(0)
    return (code >= 48 and code <= 57) or (code >= 65 and code <= 90) or (code >= 97 and code <= 122) or code == 95

func _is_whitespace(char: String) -> bool:
    return char == " " or char == "\t" or char == "\n" or char == "\r"

func _next_non_whitespace(text: String, start_idx: int) -> String:
    for i in range(start_idx, text.length()):
        var char := text.substr(i, 1)
        if not _is_whitespace(char):
            return char
    return ""

# Logging functions
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    print("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)