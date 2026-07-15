-- ============================================================================
-- ProHub Collaboration Expansion Schema
-- Migration 001: Collaboration Tables
--
-- Run this in your SEPARATE collaboration Supabase project.
-- project_id and document_id are stored as plain bigint — no cross-DB FKs.
-- ============================================================================

-- 1. document_versions
create table if not exists document_versions (
    id uuid primary key default gen_random_uuid(),
    project_id bigint not null,
    document_id bigint not null,
    version_number integer not null,
    revision_label text,
    version_status text not null default 'active',
    created_by uuid,
    created_at timestamptz not null default now(),
    is_current boolean not null default false,
    notes text,
    unique(document_id, version_number)
);

-- 2. document_files
create table if not exists document_files (
    id uuid primary key default gen_random_uuid(),
    project_id bigint not null,
    document_id bigint not null,
    version_id uuid not null references document_versions(id) on delete cascade,
    storage_bucket text not null default 'project-documents',
    storage_path text not null,
    original_filename text not null,
    display_filename text not null,
    mime_type text not null,
    file_extension text,
    size_bytes bigint not null,
    sha256_hash text not null,
    page_count integer,
    image_width integer,
    image_height integer,
    uploaded_by uuid,
    uploaded_at timestamptz not null default now(),
    is_current boolean not null default true,
    is_deleted boolean not null default false,
    deleted_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    unique(storage_bucket, storage_path)
);

create index if not exists idx_document_files_project on document_files(project_id);
create index if not exists idx_document_files_document on document_files(document_id);
create index if not exists idx_document_files_version on document_files(version_id);
create index if not exists idx_document_files_hash on document_files(project_id, sha256_hash);

-- 3. document_annotations
create table if not exists document_annotations (
    id uuid primary key default gen_random_uuid(),
    project_id bigint not null,
    document_id bigint not null,
    version_id uuid not null references document_versions(id) on delete cascade,
    document_file_id uuid not null references document_files(id) on delete cascade,
    page_number integer not null check (page_number >= 1),
    annotation_type text not null,
    geometry jsonb not null,
    style jsonb not null default '{}'::jsonb,
    comment_text text,
    status text not null default 'open',
    severity text not null default 'normal',
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_by uuid,
    updated_at timestamptz not null default now(),
    resolved_by uuid,
    resolved_at timestamptz,
    resolution_note text,
    row_version integer not null default 1,
    is_deleted boolean not null default false,
    deleted_by uuid,
    deleted_at timestamptz
);

-- 4. annotation_replies
create table if not exists annotation_replies (
    id uuid primary key default gen_random_uuid(),
    annotation_id uuid not null references document_annotations(id) on delete cascade,
    project_id bigint not null,
    reply_text text not null,
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz,
    is_deleted boolean not null default false,
    deleted_at timestamptz
);

-- 5. annotation_mentions
create table if not exists annotation_mentions (
    id uuid primary key default gen_random_uuid(),
    annotation_id uuid references document_annotations(id) on delete cascade,
    reply_id uuid references annotation_replies(id) on delete cascade,
    mentioned_user_id uuid not null,
    mentioned_by uuid not null,
    created_at timestamptz not null default now(),
    check (
        annotation_id is not null
        or reply_id is not null
    )
);

-- 6. document_locks
create table if not exists document_locks (
    id uuid primary key default gen_random_uuid(),
    project_id bigint not null,
    document_id bigint not null,
    version_id uuid not null references document_versions(id) on delete cascade,
    document_file_id uuid not null references document_files(id) on delete cascade,
    locked_by uuid not null,
    lock_token uuid not null default gen_random_uuid(),
    locked_at timestamptz not null default now(),
    heartbeat_at timestamptz not null default now(),
    expires_at timestamptz not null,
    released_at timestamptz,
    released_by uuid,
    release_reason text,
    is_active boolean not null default true
);

create unique index if not exists uq_active_document_lock on document_locks(document_file_id) where is_active = true;

-- 7. project_groups
create table if not exists project_groups (
    id uuid primary key default gen_random_uuid(),
    project_id bigint not null,
    group_name text not null,
    description text,
    group_type text not null default 'custom',
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    is_active boolean not null default true,
    unique(project_id, group_name)
);

-- 8. project_group_members
create table if not exists project_group_members (
    id uuid primary key default gen_random_uuid(),
    project_id bigint not null,
    group_id uuid not null references project_groups(id) on delete cascade,
    user_id uuid not null,
    member_role text,
    added_by uuid not null,
    added_at timestamptz not null default now(),
    is_active boolean not null default true,
    unique(group_id, user_id)
);

-- 9. notifications
create table if not exists notifications (
    id uuid primary key default gen_random_uuid(),
    project_id bigint,
    notification_type text not null,
    title text not null,
    message text not null,
    entity_type text,
    entity_id uuid,
    action_url text,
    priority text not null default 'normal',
    created_by uuid,
    created_at timestamptz not null default now(),
    deduplication_key text,
    metadata jsonb not null default '{}'::jsonb
);

-- 10. notification_recipients
create table if not exists notification_recipients (
    id uuid primary key default gen_random_uuid(),
    notification_id uuid not null references notifications(id) on delete cascade,
    user_id uuid not null,
    in_app_status text not null default 'unread',
    read_at timestamptz,
    email_requested boolean not null default false,
    email_status text not null default 'not_requested',
    email_sent_at timestamptz,
    email_failure_reason text,
    created_at timestamptz not null default now(),
    unique(notification_id, user_id)
);

-- 11. user_notification_preferences
create table if not exists user_notification_preferences (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    project_id bigint,
    event_type text not null,
    in_app_enabled boolean not null default true,
    email_enabled boolean not null default false,
    digest_enabled boolean not null default false,
    updated_at timestamptz not null default now(),
    unique(user_id, project_id, event_type)
);

-- 12. tasks
create table if not exists tasks (
    id uuid primary key default gen_random_uuid(),
    project_id bigint not null,
    title text not null,
    description text,
    task_type text not null default 'general',
    status text not null default 'unassigned',
    priority text not null default 'normal',
    start_date date,
    due_date date,
    completed_at timestamptz,
    linked_entity_type text,
    linked_entity_id uuid,
    document_id bigint,
    version_id uuid references document_versions(id) on delete set null,
    annotation_id uuid references document_annotations(id) on delete set null,
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_by uuid,
    updated_at timestamptz not null default now(),
    row_version integer not null default 1,
    is_deleted boolean not null default false,
    deleted_at timestamptz
);

-- 13. task_assignees
create table if not exists task_assignees (
    id uuid primary key default gen_random_uuid(),
    task_id uuid not null references tasks(id) on delete cascade,
    user_id uuid,
    group_id uuid references project_groups(id) on delete cascade,
    assignment_type text not null default 'user',
    is_primary boolean not null default false,
    assigned_by uuid not null,
    assigned_at timestamptz not null default now(),
    removed_at timestamptz,
    check (
        (assignment_type = 'user' and user_id is not null and group_id is null)
        or
        (assignment_type = 'group' and group_id is not null and user_id is null)
    )
);

-- 14. task_activity
create table if not exists task_activity (
    id uuid primary key default gen_random_uuid(),
    task_id uuid not null references tasks(id) on delete cascade,
    project_id bigint not null,
    activity_type text not null,
    field_name text,
    old_value text,
    new_value text,
    message text,
    performed_by uuid not null,
    performed_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
);

-- 15. collaboration_audit_events
create table if not exists collaboration_audit_events (
    id uuid primary key default gen_random_uuid(),
    project_id bigint not null,
    entity_type text not null,
    entity_id uuid not null,
    action text not null,
    actor_user_id uuid,
    actor_display_name text,
    before_state jsonb,
    after_state jsonb,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
