// Initialize local-pr-reviewer in a project
// Creates .mcp.json and updates .claude/settings.local.json if needed

import * as p from '@clack/prompts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import color from 'picocolors';
import { isGitRepo } from '../utils/migration.js';
import { getMcpServerPath } from '../utils/paths.js';

interface McpJsonConfig {
	mcpServers?: Record<
		string,
		{
			command: string;
			args: string[];
		}
	>;
}

interface ClaudeLocalSettings {
	permissions?: {
		allow?: string[];
	};
	enabledMcpjsonServers?: string[];
	[key: string]: unknown;
}

const MCP_PERMISSIONS = [
	'mcp__local-pr-reviewer__check_pr_comments',
	'mcp__local-pr-reviewer__mark_comment_resolved',
	'mcp__local-pr-reviewer__get_comment_details',
];

export async function init(): Promise<void> {
	const cwd = process.cwd();

	p.intro(color.bgCyan(color.black(' local-pr-reviewer init ')));

	// Check if we're in a git repo
	if (!isGitRepo(cwd)) {
		p.log.error(
			'Not a git repository. Run this command from a project root.',
		);
		process.exit(1);
	}

	const mcpJsonPath = join(cwd, '.mcp.json');
	const claudeSettingsPath = join(cwd, '.claude', 'settings.local.json');
	const gitignorePath = join(cwd, '.gitignore');

	// Check what needs to be done
	const mcpJsonExists = existsSync(mcpJsonPath);
	const claudeSettingsExists = existsSync(claudeSettingsPath);

	let mcpJsonNeedsUpdate = true;
	let claudeSettingsNeedsUpdate = false;

	if (mcpJsonExists) {
		try {
			const existing = JSON.parse(
				readFileSync(mcpJsonPath, 'utf-8'),
			) as McpJsonConfig;
			if (existing.mcpServers?.['local-pr-reviewer']) {
				mcpJsonNeedsUpdate = false;
				p.log.info('.mcp.json already configured');
			}
		} catch {
			// Invalid JSON, will recreate
		}
	}

	if (claudeSettingsExists) {
		try {
			const existing = JSON.parse(
				readFileSync(claudeSettingsPath, 'utf-8'),
			) as ClaudeLocalSettings;

			// Check if enabledMcpjsonServers exists and doesn't include local-pr-reviewer
			if (
				existing.enabledMcpjsonServers &&
				!existing.enabledMcpjsonServers.includes('local-pr-reviewer')
			) {
				claudeSettingsNeedsUpdate = true;
			}

			// Check if permissions exist and are missing our tools
			if (existing.permissions?.allow) {
				const missingPermissions = MCP_PERMISSIONS.filter(
					(p) => !existing.permissions!.allow!.includes(p),
				);
				if (missingPermissions.length > 0) {
					claudeSettingsNeedsUpdate = true;
				}
			}
		} catch {
			// Invalid JSON, skip
		}
	}

	if (!mcpJsonNeedsUpdate && !claudeSettingsNeedsUpdate) {
		p.log.success('Project already configured for local-pr-reviewer!');
		p.outro('Nothing to do.');
		return;
	}

	// Show what will be done
	const actions: string[] = [];
	if (mcpJsonNeedsUpdate) {
		actions.push(mcpJsonExists ? 'Update .mcp.json' : 'Create .mcp.json');
	}
	if (claudeSettingsNeedsUpdate) {
		actions.push('Update .claude/settings.local.json');
	}

	p.log.info(`Will perform:\n${actions.map((a) => `  • ${a}`).join('\n')}`);

	const proceed = await p.confirm({
		message: 'Continue?',
		initialValue: true,
	});

	if (p.isCancel(proceed) || !proceed) {
		p.cancel('Cancelled.');
		process.exit(0);
	}

	// Create/update .mcp.json
	if (mcpJsonNeedsUpdate) {
		const mcpServerPath = getMcpServerPath();
		let mcpConfig: McpJsonConfig = {};

		if (mcpJsonExists) {
			try {
				mcpConfig = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
			} catch {
				mcpConfig = {};
			}
		}

		mcpConfig.mcpServers = {
			...mcpConfig.mcpServers,
			'local-pr-reviewer': {
				command: 'node',
				args: [mcpServerPath],
			},
		};

		writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + '\n');
		p.log.success('Created/updated .mcp.json');

		// Add to .gitignore if not already there
		if (existsSync(gitignorePath)) {
			const gitignore = readFileSync(gitignorePath, 'utf-8');
			if (!gitignore.includes('.mcp.json')) {
				writeFileSync(
					gitignorePath,
					gitignore.trimEnd() +
						'\n\n# Local MCP configuration (contains absolute paths)\n.mcp.json\n',
				);
				p.log.info('Added .mcp.json to .gitignore');
			}
		} else {
			writeFileSync(
				gitignorePath,
				'# Local MCP configuration (contains absolute paths)\n.mcp.json\n',
			);
			p.log.info('Created .gitignore with .mcp.json');
		}
	}

	// Update .claude/settings.local.json
	if (claudeSettingsNeedsUpdate && claudeSettingsExists) {
		try {
			const settings = JSON.parse(
				readFileSync(claudeSettingsPath, 'utf-8'),
			) as ClaudeLocalSettings;

			// Add to enabledMcpjsonServers
			if (settings.enabledMcpjsonServers) {
				if (
					!settings.enabledMcpjsonServers.includes(
						'local-pr-reviewer',
					)
				) {
					settings.enabledMcpjsonServers.push('local-pr-reviewer');
				}
			}

			// Add permissions
			if (settings.permissions?.allow) {
				for (const perm of MCP_PERMISSIONS) {
					if (!settings.permissions.allow.includes(perm)) {
						settings.permissions.allow.push(perm);
					}
				}
			}

			writeFileSync(
				claudeSettingsPath,
				JSON.stringify(settings, null, 2) + '\n',
			);
			p.log.success('Updated .claude/settings.local.json');
		} catch (error) {
			p.log.warn(
				`Could not update .claude/settings.local.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	p.outro(color.green('Project initialized for local-pr-reviewer!'));

	p.note(
		`Start reviewing:\n  ${color.cyan('npx local-pr-reviewer')}`,
		'Next steps',
	);
}
