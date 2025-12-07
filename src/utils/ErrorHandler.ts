import { Notice } from 'obsidian';
import { DefinitionError, DefinitionErrorType } from '../types';

export class ErrorHandler {
	/**
	 * Handle a definition error
	 */
	static handle(error: DefinitionError | Error): void {
		if (error instanceof DefinitionError) {
			console.error(`[Note Definitions] ${error.type}:`, error.message, error.context);
			new Notice(this.getUserMessage(error));
			this.attemptRecovery(error);
		} else {
			console.error('[Note Definitions] Unexpected error:', error);
			new Notice('An unexpected error occurred');
		}
	}

	/**
	 * Get user-friendly error message
	 */
	private static getUserMessage(error: DefinitionError): string {
		switch (error.type) {
			case 'parse':
				return `Failed to parse definition file: ${error.message}`;
			case 'filesystem':
				return `File system error: ${error.message}`;
			case 'navigation':
				return `Navigation error: ${error.message}`;
			case 'validation':
				return `Validation error: ${error.message}`;
			default:
				return `Error: ${error.message}`;
		}
	}

	/**
	 * Attempt to recover from error
	 */
	private static attemptRecovery(error: DefinitionError): void {
		switch (error.type) {
			case 'parse':
				// Skip the problematic file and continue
				break;
			case 'filesystem':
				// Suggest refreshing definitions
				break;
			case 'navigation':
				// No recovery needed
				break;
			case 'validation':
				// No recovery needed
				break;
		}
	}

	/**
	 * Create a definition error
	 */
	static createError(type: DefinitionErrorType, message: string, context?: any): DefinitionError {
		return new DefinitionError(type, message, context);
	}
}
