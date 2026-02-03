// Migration utilities for local-pr-reviewer v1 -> v2

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import color from 'picocolors';
import {
	getAgentsConfigPath,
	getConfigDir,
	getVersionJsonPath,
} from './paths.js';

interface MigrationResult {
	ok: boolean;
	message?: string;
}

interface VersionInfo {
	version: string;
	configVersion?: number; // NEW in v2
	installedAt: string;
}

const CURRENT_CONFIG_VERSION = 2;

export async function migrateIfNeeded(): Promise<MigrationResult> {
	const configDir = getConfigDir();

	// Check if setup has been run at all
	if (!existsSync(configDir)) {
		return {
			ok: false,
			message: 'local-pr-reviewer is not installed.',
		};
	}

	const versionPath = getVersionJsonPath();
	if (!existsSync(versionPath)) {
		return {
			ok: false,
			message: 'Configuration is incomplete or corrupted.',
		};
	}

	// Read current version info
	let versionInfo: VersionInfo;
	try {
		versionInfo = JSON.parse(readFileSync(versionPath, 'utf-8'));
	} catch {
		return {
			ok: false,
			message: 'Could not read version info.',
		};
	}

	// Check if migration needed
	const configVersion = versionInfo.configVersion ?? 1;

	if (configVersion < CURRENT_CONFIG_VERSION) {
		console.log(color.yellow('\nMigrating configuration to v2...\n'));

		// Migration: v1 -> v2
		if (configVersion === 1) {
			await migrateV1ToV2();
		}

		// Update version info
		versionInfo.configVersion = CURRENT_CONFIG_VERSION;
		writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));

		console.log(color.green('Migration complete.\n'));
	}

	// Clean up signal file in cwd if exists
	cleanupSignalFile(process.cwd());

	return { ok: true };
}

async function migrateV1ToV2(): Promise<void> {
	// 1. Create agents.json with default
	const agentsConfigPath = getAgentsConfigPath();
	if (!existsSync(agentsConfigPath)) {
		const defaultConfig = {
			default: 'claude',
			projects: {},
		};
		writeFileSync(agentsConfigPath, JSON.stringify(defaultConfig, null, 2));
		console.log(
			`  ${color.green('✓')} Created agents.json with default: claude`,
		);
	}

	// 2. Note: MCP tools are reduced server-side, no config change needed
	console.log(`  ${color.green('✓')} MCP tools updated (server-side)`);

	// 3. Skills removal - just inform user
	console.log(`  ${color.yellow('!')} Skills are no longer used in v2`);
	console.log(`    You can manually remove the skill if installed:`);
	console.log(
		`    ${color.dim('npx skills remove local-pr-reviewer-setup')}`,
	);
}

function cleanupSignalFile(dir: string): void {
	const signalPath = join(dir, '.local-pr-reviewer-pending');
	if (existsSync(signalPath)) {
		try {
			unlinkSync(signalPath);
			console.log(color.dim('Cleaned up legacy signal file.\n'));
		} catch {
			// Ignore errors - file might be locked
		}
	}
}

/**
 * Check if current directory is a git repository
 */
export function isGitRepo(dir: string): boolean {
	return existsSync(join(dir, '.git'));
}

/**
 * Get the agent to use for a given project path
 */
export function getAgentForProject(projectPath: string): string {
	const configPath = getAgentsConfigPath();

	let config = { default: 'claude', projects: {} as Record<string, string> };

	try {
		config = JSON.parse(readFileSync(configPath, 'utf-8'));
	} catch {
		// Use defaults
	}

	// Check for project-specific override
	return config.projects[projectPath] ?? config.default;
}
