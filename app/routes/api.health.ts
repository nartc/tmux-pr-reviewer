/**
 * Health check endpoint for the webapp
 * GET /api/health
 *
 * Used by agents to verify the webapp is running
 */

export function loader() {
	return Response.json({ status: 'ok' });
}
