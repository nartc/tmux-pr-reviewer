#!/usr/bin/env node
// Setup script - auto-configures MCP for compatible coding agents

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

const mcpServerPath = join(process.cwd(), 'dist', 'mcp-server', 'index.js');

// MCP configuration for pr-reviewer (standard format)
const mcpConfig = {
	command: 'node',
	args: [mcpServerPath],
};

// MCP configuration for OpenCode (uses different format)
const opencodeMcpConfig = {
	type: 'local',
	command: ['node', mcpServerPath],
};

// Agent configurations
const agents = [
	// Claude Desktop (macOS)
	{
		name: 'Claude Desktop',
		configPath: join(
			homedir(),
			'Library',
			'Application Support',
			'Claude',
			'claude_desktop_config.json',
		),
		configKey: 'mcpServers',
		detected: false,
	},
	// Claude Code CLI (Linux)
	{
		name: 'Claude Code (Linux)',
		configPath: join(homedir(), '.config', 'claude', 'config.json'),
		configKey: 'mcpServers',
		detected: false,
	},
	// OpenCode (uses different format)
	{
		name: 'OpenCode',
		configPath: join(homedir(), '.config', 'opencode', 'opencode.json'),
		configKey: 'mcp',
		configFormat: 'opencode', // Special format
		detected: false,
	},
	// Cline (VS Code extension)
	{
		name: 'Cline (VS Code)',
		configPath: join(
			homedir(),
			'.config',
			'Code',
			'User',
			'globalStorage',
			'saoudrizwan.claude-dev',
			'settings',
			'cline_mcp_settings.json',
		),
		configKey: 'mcpServers',
		detected: false,
	},
	// Continue.dev
	{
		name: 'Continue.dev',
		configPath: join(homedir(), '.continue', 'config.json'),
		configKey: 'mcpServers',
		detected: false,
	},
	// Cursor
	{
		name: 'Cursor',
		configPath: join(homedir(), '.cursor', 'mcp.json'),
		configKey: 'mcpServers',
		detected: false,
	},
];

console.log('');
console.log('PR Reviewer MCP Setup');
console.log('═════════════════════');
console.log('');

// Check if MCP server is built
if (!existsSync(mcpServerPath)) {
	console.log('⚠️  MCP server not built yet');
	console.log('   Run: pnpm build:mcp');
	console.log('');
	console.log('   Then run this script again: pnpm setup:mcp');
	console.log('');
	process.exit(1);
}

console.log('Detecting installed coding agents...');
console.log('');

let configured = 0;
let failed = 0;

for (const agent of agents) {
	const configDir = dirname(agent.configPath);

	// Check if agent directory exists (indicates agent is installed)
	if (existsSync(configDir)) {
		agent.detected = true;
		console.log(`✓ Found ${agent.name}`);

		try {
			// Read existing config or create new one
			let config = {};
			if (existsSync(agent.configPath)) {
				try {
					config = JSON.parse(
						readFileSync(agent.configPath, 'utf-8'),
					);
				} catch {
					// If parse fails, start fresh
					config = {};
				}
			}

			// Add or update MCP configuration
			if (!config[agent.configKey]) {
				config[agent.configKey] = {};
			}

			// Choose the right config format based on agent
			const configToUse =
				agent.configFormat === 'opencode'
					? opencodeMcpConfig
					: mcpConfig;

			const existingConfig = config[agent.configKey]['pr-reviewer'];
			if (existingConfig) {
				// Check if it's already correctly configured
				const isConfigured =
					agent.configFormat === 'opencode'
						? existingConfig.type === 'local' &&
							JSON.stringify(existingConfig.command) ===
								JSON.stringify(opencodeMcpConfig.command)
						: existingConfig.command === mcpConfig.command &&
							JSON.stringify(existingConfig.args) ===
								JSON.stringify(mcpConfig.args);

				if (isConfigured) {
					console.log(`  → Already configured`);
					configured++;
					continue;
				}
			}

			config[agent.configKey]['pr-reviewer'] = configToUse;

			// Ensure directory exists
			mkdirSync(configDir, { recursive: true });

			// Write config
			writeFileSync(
				agent.configPath,
				JSON.stringify(config, null, 2),
				'utf-8',
			);

			console.log(`  → Configured successfully`);
			configured++;
		} catch (error) {
			console.log(
				`  ✗ Failed to configure: ${error instanceof Error ? error.message : error}`,
			);
			failed++;
		}
	}
}

console.log('');

if (agents.filter((a) => a.detected).length === 0) {
	console.log('No compatible coding agents detected.');
	console.log('');
	console.log('Manual configuration:');
	console.log('─────────────────────');
	console.log('');
	console.log('Add this to your MCP configuration:');
	console.log('');
	console.log('{');
	console.log('  "mcpServers": {');
	console.log('    "pr-reviewer": {');
	console.log('      "command": "node",');
	console.log(`      "args": ["${mcpServerPath}"]`);
	console.log('    }');
	console.log('  }');
	console.log('}');
	console.log('');
	console.log('Supported agents:');
	console.log(
		'  • Claude Desktop (macOS): ~/Library/Application Support/Claude/claude_desktop_config.json',
	);
	console.log('  • Claude Code (Linux): ~/.config/claude/config.json');
	console.log('  • OpenCode: ~/.config/opencode/opencode.json');
	console.log(
		'  • Cline: ~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
	);
	console.log('  • Continue.dev: ~/.continue/config.json');
	console.log('  • Cursor: ~/.cursor/mcp.json');
	console.log('');
	console.log('Note: OpenCode uses a different format:');
	console.log('{');
	console.log('  "mcp": {');
	console.log('    "pr-reviewer": {');
	console.log('      "type": "local",');
	console.log(`      "command": ["node", "${mcpServerPath}"]`);
	console.log('    }');
	console.log('  }');
	console.log('}');
} else {
	console.log('Summary:');
	console.log(`  Configured: ${configured}`);
	if (failed > 0) {
		console.log(`  Failed: ${failed}`);
	}
	console.log('');

	if (configured > 0) {
		console.log('Next steps:');
		console.log('  1. Restart your coding agent');
		console.log('  2. Start PR Reviewer: pnpm dev');
		console.log('  3. Add comments in the UI');
		console.log('  4. Ask your agent: "Check for PR comments"');
	}
}

console.log('');
