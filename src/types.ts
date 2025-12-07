/**
 * Core type definitions for the Note Definitions plugin
 */

/**
 * Represents a single definition entry
 */
export interface Definition {
	/** The main word or phrase being defined */
	phrase: string;

	/** Alternative terms that refer to the same definition */
	aliases: string[];

	/** The definition content in markdown format */
	content: string;

	/** Path to the file containing this definition */
	sourceFile: string;

	/** Type of definition file */
	sourceType: 'consolidated' | 'atomic';

	/** Line number where definition starts (for consolidated files) */
	lineNumber?: number;

	/** Block ID for precise navigation */
	blockId?: string;
}

/**
 * Plugin settings interface
 */
export interface PluginSettings {
	/** Path to the folder containing definition files */
	definitionFolder: string;

	/** Pattern to recognize as dividers in consolidated files */
	dividerPattern: 'hyphens' | 'both';

	/** Whether to show definition preview on hover */
	enableHoverPreview: boolean;

	/** Delay in milliseconds before showing hover popover */
	popoverDelay: number;

	/** Whether to hide popover when mouse leaves the highlighted word */
	hidePopoverOnMouseOut: boolean;

	/** Last selected definition file for adding new definitions */
	lastSelectedDefinitionFile: string;

	/** Custom color for definition underline */
	underlineColor: string;
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: PluginSettings = {
	definitionFolder: '',
	dividerPattern: 'hyphens',
	enableHoverPreview: true,
	popoverDelay: 300,
	hidePopoverOnMouseOut: false,
	lastSelectedDefinitionFile: '',
	underlineColor: ''
};

/**
 * Definition cache structure
 */
export interface DefinitionCache {
	/** Map of lowercase phrase/alias to definitions */
	definitions: Map<string, Definition[]>;

	/** Map of file path to phrases defined in that file */
	fileIndex: Map<string, string[]>;

	/** Timestamp of last cache update */
	lastUpdate: number;
}

/**
 * Definition context for a specific note
 */
export interface DefinitionContext {
	/** Path to the current note file */
	noteFile: string;

	/** Paths to definition files to use for this note */
	contextFiles: string[];
}

/**
 * Error types for the plugin
 */
export type DefinitionErrorType = 'parse' | 'filesystem' | 'navigation' | 'validation';

/**
 * Custom error class for definition-related errors
 */
export class DefinitionError extends Error {
	type: DefinitionErrorType;
	context: any;

	constructor(type: DefinitionErrorType, message: string, context?: any) {
		super(message);
		this.type = type;
		this.context = context;
		this.name = 'DefinitionError';
	}
}
