/**
 * Validation utilities for path validation and error responses
 */

import type { ErrorResponse } from '../types.js';

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';

/**
 * Log debug messages if debug mode is enabled
 */
export function logDebug(message: string): void {
	if (DEBUG_MODE) {
		console.debug(`[DEBUG] ${message}`);
	}
}

/**
 * Create a standardized error response with possible solutions
 */
export function createErrorResponse(message: string, possibleSolutions: string[] = []): ErrorResponse {
	// Log the error
	console.error(`[SERVER] Error response: ${message}`);
	if (possibleSolutions.length > 0) {
		console.error(`[SERVER] Possible solutions: ${possibleSolutions.join(', ')}`);
	}

	const response: ErrorResponse = {
		content: [
			{
				type: 'text',
				text: message,
			},
		],
		isError: true,
	};

	if (possibleSolutions.length > 0) {
		response.content.push({
			type: 'text',
			text: 'Possible solutions:\n- ' + possibleSolutions.join('\n- '),
		});
	}

	return response;
}

/**
 * Validate a path to prevent path traversal attacks
 */
export function validatePath(path: string): boolean {
	// Basic validation to prevent path traversal
	if (!path || path.includes('..')) {
		return false;
	}

	// Add more validation as needed
	return true;
}
