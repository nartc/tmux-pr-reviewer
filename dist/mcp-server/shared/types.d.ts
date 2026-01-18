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
export interface McpClient {
    id: string;
    client_name: string | null;
    client_version: string | null;
    connected_at: string;
    last_seen_at: string;
    working_dir: string | null;
}
export interface CommentDelivery {
    id: string;
    comment_id: string;
    client_id: string | null;
    delivered_at: string;
}
export interface Repo {
    id: string;
    remote_url: string | null;
    name: string;
    base_branch: string;
    created_at: string;
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
export interface CommentWithRepo extends Comment {
    repo_name: string;
    repo_path: string;
}
export interface PendingCommentSummary {
    repo_name: string;
    repo_path: string;
    count: number;
}
