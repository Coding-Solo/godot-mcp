/**
 * Parameter conversion utilities for snake_case ↔ camelCase conversion
 */

import type { OperationParams } from '../types.js';

/**
 * Parameter name mappings between snake_case and camelCase
 * This allows the server to accept both formats
 */
const PARAMETER_MAPPINGS: Record<string, string> = {
	'project_path': 'projectPath',
	'scene_path': 'scenePath',
	'root_node_type': 'rootNodeType',
	'parent_node_path': 'parentNodePath',
	'node_type': 'nodeType',
	'node_name': 'nodeName',
	'texture_path': 'texturePath',
	'node_path': 'nodePath',
	'output_path': 'outputPath',
	'mesh_item_names': 'meshItemNames',
	'new_path': 'newPath',
	'file_path': 'filePath',
	'directory': 'directory',
	'recursive': 'recursive',
	'scene': 'scene',
};

/**
 * Reverse mapping from camelCase to snake_case
 * Generated from PARAMETER_MAPPINGS for quick lookups
 */
const REVERSE_PARAMETER_MAPPINGS: Record<string, string> = {};
for (const [snakeCase, camelCase] of Object.entries(PARAMETER_MAPPINGS)) {
	REVERSE_PARAMETER_MAPPINGS[camelCase] = snakeCase;
}

/**
 * ParameterMapper class for converting between snake_case and camelCase
 */
export class ParameterMapper {
	/**
	 * Normalize parameters to camelCase format
	 * @param params Object with either snake_case or camelCase keys
	 * @returns Object with all keys in camelCase format
	 */
	static normalizeParameters(params: OperationParams): OperationParams {
		if (!params || typeof params !== 'object') {
			return params;
		}

		const result: OperationParams = {};

		for (const key in params) {
			if (Object.prototype.hasOwnProperty.call(params, key)) {
				let normalizedKey = key;

				// If the key is in snake_case, convert it to camelCase using our mapping
				if (key.includes('_') && PARAMETER_MAPPINGS[key]) {
					normalizedKey = PARAMETER_MAPPINGS[key];
				}

				// Handle nested objects recursively
				if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
					result[normalizedKey] = this.normalizeParameters(params[key] as OperationParams);
				} else {
					result[normalizedKey] = params[key];
				}
			}
		}

		return result;
	}

	/**
	 * Convert camelCase keys to snake_case
	 * @param params Object with camelCase keys
	 * @returns Object with snake_case keys
	 */
	static convertCamelToSnakeCase(params: OperationParams): OperationParams {
		const result: OperationParams = {};

		for (const key in params) {
			if (Object.prototype.hasOwnProperty.call(params, key)) {
				// Convert camelCase to snake_case
				const snakeKey = REVERSE_PARAMETER_MAPPINGS[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

				// Handle nested objects recursively
				if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
					result[snakeKey] = this.convertCamelToSnakeCase(params[key] as OperationParams);
				} else {
					result[snakeKey] = params[key];
				}
			}
		}

		return result;
	}
}
