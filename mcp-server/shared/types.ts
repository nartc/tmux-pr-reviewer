// Shared types for MCP server

export interface Comment {
	id: string;
	session_id: string;
	file_path: string;
	line_start: number | null;
	line_end: number | null;
	side: 'old' | 'new' | 'both' | null;
	content: string;
	status: 'queued' | 'staged' | 'sent' | 'cancelled';
	created_at: string;
	sent_at: string | null;
	delivered_at: string | null;
	resolved_at: string | null;
	resolved_by: string | null;
}

export interface RepoPath {
	id: string;
	repo_id: string;
	path: string;
	last_accessed_at: string | null;
	created_at: string;
}

export interface ReviewSession {
	id: string;
	repo_id: string;
	branch: string;
	base_branch: string | null;
	created_at: string;
}

export interface Repo {
	id: string;
	remote_url: string | null;
	name: string;
	base_branch: string;
	created_at: string;
}
