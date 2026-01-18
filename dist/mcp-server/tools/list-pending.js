// Tool: list_pending_comments
// Lists pending PR review comments across all repositories
import { Effect } from 'effect';
import { DbService } from '../shared/db.js';
export const listPending = () => Effect.gen(function* () {
    const db = yield* DbService;
    yield* Effect.logDebug('Listing pending comments across all repos');
    // Get count of undelivered 'sent' comments per repo
    const results = yield* db.query(`SELECT 
			   r.name as repo_name,
			   rp.path as repo_path,
			   COUNT(CASE WHEN c.status = 'sent' AND c.delivered_at IS NULL THEN 1 END) as pending_count
			 FROM repos r
			 JOIN repo_paths rp ON rp.repo_id = r.id
			 LEFT JOIN review_sessions rs ON rs.repo_id = r.id
			 LEFT JOIN comments c ON c.session_id = rs.id
			 GROUP BY r.id, rp.id
			 ORDER BY pending_count DESC, r.name`, []);
    if (results.length === 0) {
        return 'No repositories registered. Open the PR Reviewer UI to register a repository.';
    }
    const totalPending = results.reduce((sum, r) => sum + r.pending_count, 0);
    yield* Effect.logInfo('Listed pending comments', {
        repoCount: results.length,
        totalPending,
    });
    const lines = [
        'Pending PR comments across repositories:',
        '',
    ];
    for (const repo of results) {
        const bullet = repo.pending_count > 0 ? '●' : '○';
        const countText = repo.pending_count === 1
            ? '1 comment'
            : `${repo.pending_count} comments`;
        lines.push(`${bullet} ${repo.repo_name} (${countText})`);
        lines.push(`  ${repo.repo_path}`);
    }
    lines.push('');
    lines.push(`Total: ${totalPending} pending comment${totalPending === 1 ? '' : 's'}`);
    return lines.join('\n');
}).pipe(Effect.withSpan('tool.listPending'));
