// Tool: check_for_pending_reviews
// Lightweight signal-based check for pending PR reviews across all repos
// No database access - just filesystem signals

import { Effect, Option } from 'effect';
import {
	getConfig,
	getWebappUrl,
	readAllPendingReviews,
	type PendingReview,
} from '../shared/global-config.js';

export interface CheckPendingReviewsResult {
	configured: boolean;
	webappUrl: string | null;
	hasPending: boolean;
	pending: PendingReview[];
}

/**
 * Check for pending PR reviews by scanning signal files.
 * This is a lightweight operation - no database access required.
 * Also cleans up stale signals (>7 days) during the scan.
 */
export const checkPendingReviews = Effect.gen(function* () {
	// Check if local-pr-reviewer is configured
	const config = yield* getConfig;

	if (Option.isNone(config)) {
		return JSON.stringify(
			{
				configured: false,
				webappUrl: null,
				hasPending: false,
				pending: [],
				message:
					'Local PR Reviewer is not configured. Run setup first.',
			} satisfies CheckPendingReviewsResult & { message: string },
			null,
			2,
		);
	}

	// Get webapp URL
	const webappUrl = yield* getWebappUrl;

	// Read all pending reviews from signal files
	const pending = yield* readAllPendingReviews;

	const result: CheckPendingReviewsResult = {
		configured: true,
		webappUrl: Option.getOrNull(webappUrl),
		hasPending: pending.length > 0,
		pending,
	};

	if (pending.length === 0) {
		return (
			'No pending PR review comments.\n\n' +
			JSON.stringify(result, null, 2)
		);
	}

	// Format human-readable output
	const lines: string[] = [
		`Found ${pending.length} repository${pending.length === 1 ? '' : 'ies'} with pending review comments:`,
		'',
	];

	for (const review of pending) {
		const waitingTime = getWaitingTime(review.waitingSince);
		lines.push(
			`- ${review.repoName}: ${review.pendingCount} comment${review.pendingCount === 1 ? '' : 's'} (waiting ${waitingTime})`,
		);
		lines.push(`  Path: ${review.repoPath}`);
	}

	lines.push('');
	lines.push(
		'Use check_pr_comments to fetch details for a specific repository.',
	);

	if (Option.isSome(webappUrl)) {
		lines.push(`\nWebapp: ${webappUrl.value}`);
	}

	return lines.join('\n');
}).pipe(Effect.withSpan('tool.checkPendingReviews'));

/**
 * Format time since waiting in human-readable format
 */
function getWaitingTime(isoDate: string): string {
	const waitingMs = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(waitingMs / 60000);

	if (minutes < 1) return 'less than a minute';
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? '' : 's'}`;
}
