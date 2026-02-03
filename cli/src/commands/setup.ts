// Setup command for local-pr-reviewer

import * as p from '@clack/prompts';
import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import color from 'picocolors';
import { configureMcp, type CodingAgent } from '../utils/mcp-config.js';
import {
	getAgentsConfigPath,
	getConfigDir,
	getEnvPath,
} from '../utils/paths.js';
import {
	getCliVersion,
	isBreakingChange,
	readVersionInfo,
	writeVersionInfo,
} from '../utils/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to bundled artifacts (relative to dist/commands/)
const ARTIFACTS_DIR = join(__dirname, '..', '..', 'artifacts');

type AiProvider = 'google' | 'openai' | 'anthropic';

interface SetupOptions {
	force?: boolean;
}

export async function setup(options: SetupOptions = {}): Promise<void> {
	p.intro(color.bgCyan(color.black(' local-pr-reviewer setup ')));

	const configDir = getConfigDir();
	const currentVersion = getCliVersion();
	const existingVersion = readVersionInfo();

	// Check for existing installation
	if (existingVersion && !options.force) {
		if (isBreakingChange(existingVersion.version, currentVersion)) {
			const shouldProceed = await p.confirm({
				message: `Breaking change detected (${existingVersion.version} -> ${currentVersion}). This may require reconfiguration. Proceed?`,
				initialValue: false,
			});

			if (p.isCancel(shouldProceed) || !shouldProceed) {
				p.cancel('Setup cancelled.');
				process.exit(0);
			}
		} else if (existingVersion.version === currentVersion) {
			p.log.info(
				`Already installed (v${currentVersion}). Use 'npx local-pr-reviewer@latest setup' to update.`,
			);
			p.outro('Nothing to do.');
			return;
		} else {
			p.log.info(
				`Updating from v${existingVersion.version} to v${currentVersion}`,
			);
		}
	}

	// Check if artifacts exist
	if (!existsSync(ARTIFACTS_DIR)) {
		p.log.error(
			`Artifacts not found at ${ARTIFACTS_DIR}. The package may be corrupted.`,
		);
		process.exit(1);
	}

	// Create config directory
	const s = p.spinner();
	s.start('Creating configuration directory');

	try {
		mkdirSync(configDir, { recursive: true });
		mkdirSync(join(configDir, 'db'), { recursive: true });
		s.stop('Configuration directory created');
	} catch (error) {
		s.stop('Failed to create configuration directory');
		throw error;
	}

	// Copy artifacts
	s.start('Copying artifacts');

	try {
		const artifactItems = readdirSync(ARTIFACTS_DIR);
		for (const item of artifactItems) {
			const src = join(ARTIFACTS_DIR, item);
			const dest = join(configDir, item);
			cpSync(src, dest, { recursive: true });
		}
		s.stop('Artifacts copied');
	} catch (error) {
		s.stop('Failed to copy artifacts');
		throw error;
	}

	// Install production dependencies
	s.start('Installing dependencies');

	try {
		// Check if package.json exists in config dir
		const packageJsonPath = join(configDir, 'package.json');
		if (existsSync(packageJsonPath)) {
			// Use npm to install production dependencies
			spawnSync('npm', ['install', '--omit=dev'], {
				cwd: configDir,
				stdio: 'ignore',
			});
		}
		s.stop('Dependencies installed');
	} catch (error) {
		s.stop('Failed to install dependencies');
		throw error;
	}

	// AI configuration
	const enableAi = await p.confirm({
		message: 'Enable AI features? (optional)',
		initialValue: false,
	});

	if (p.isCancel(enableAi)) {
		p.cancel('Setup cancelled.');
		process.exit(0);
	}

	let aiProvider: AiProvider | undefined;
	let apiKey: string | undefined;

	if (enableAi) {
		const providerResult = await p.select({
			message: 'Select AI provider',
			options: [
				{ value: 'google', label: 'Google (Gemini)' },
				{ value: 'openai', label: 'OpenAI' },
				{ value: 'anthropic', label: 'Anthropic (Claude)' },
			],
		});

		if (p.isCancel(providerResult)) {
			p.cancel('Setup cancelled.');
			process.exit(0);
		}

		aiProvider = providerResult as AiProvider;

		const keyResult = await p.password({
			message: `Enter your ${aiProvider.toUpperCase()} API key`,
		});

		if (p.isCancel(keyResult)) {
			p.cancel('Setup cancelled.');
			process.exit(0);
		}

		apiKey = keyResult;
	}

	// Write .env file
	if (aiProvider && apiKey) {
		const envContent = generateEnvContent(aiProvider, apiKey);
		writeFileSync(getEnvPath(), envContent);
		p.log.success('AI configuration saved');
	}

	// Coding agents configuration
	const agentsResult = await p.multiselect({
		message: 'Which coding agents do you use?',
		options: [
			{ value: 'claude-code', label: 'Claude Code' },
			{ value: 'opencode', label: 'OpenCode' },
		],
		required: true,
	});

	if (p.isCancel(agentsResult)) {
		p.cancel('Setup cancelled.');
		process.exit(0);
	}

	const agents = agentsResult as CodingAgent[];

	// Configure MCP for each agent
	for (const agent of agents) {
		s.start(`Configuring MCP for ${agent}`);
		const result = configureMcp(agent);
		if (result.success) {
			s.stop(`MCP configured for ${agent}`);
		} else {
			s.stop(`Failed to configure MCP for ${agent}`);
			p.log.warn(`Could not write to ${result.path}`);
		}
	}

	// Default agent selection for loop
	const defaultAgentOptions = agents.map((a) => ({
		value: a === 'claude-code' ? 'claude' : a,
		label: a === 'claude-code' ? 'Claude Code' : 'OpenCode',
	}));

	const defaultAgentResult = await p.select({
		message: 'Which agent should be the default for the review loop?',
		options: defaultAgentOptions,
	});

	if (p.isCancel(defaultAgentResult)) {
		p.cancel('Setup cancelled.');
		process.exit(0);
	}

	// Write agents.json
	const agentsConfig = {
		default: defaultAgentResult,
		projects: {},
	};
	writeFileSync(getAgentsConfigPath(), JSON.stringify(agentsConfig, null, 2));
	p.log.success('Agent configuration saved');

	// Write version info (with configVersion for v2)
	writeVersionInfo(currentVersion);

	p.outro(color.green('Setup complete!'));

	p.note(
		`Start the review loop:\n  ${color.cyan('npx local-pr-reviewer')}\n\nOr start server only:\n  ${color.cyan('npx local-pr-reviewer start')}`,
		'Next steps',
	);
}

function generateEnvContent(provider: AiProvider, apiKey: string): string {
	const lines: string[] = ['# AI Configuration for local-pr-reviewer'];

	lines.push(`AI_PROVIDER=${provider}`);

	switch (provider) {
		case 'google':
			lines.push(`GOOGLE_API_KEY=${apiKey}`);
			break;
		case 'openai':
			lines.push(`OPENAI_API_KEY=${apiKey}`);
			break;
		case 'anthropic':
			lines.push(`ANTHROPIC_API_KEY=${apiKey}`);
			break;
	}

	return lines.join('\n') + '\n';
}
