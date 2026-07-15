-- ============================================================================
-- ProHub Collaboration Lock Management RPC
-- Migration 002: acquire_document_lock Function
-- Run this AFTER 001_collaboration_schema.sql in the same Supabase project.
-- ============================================================================

create or replace function acquire_document_lock(
    p_document_file_id uuid,
    p_user_id uuid,
    p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_lock document_locks;
begin
    -- 1. Deactivate expired locks for this file.
    update document_locks
    set
        is_active = false,
        released_at = now(),
        release_reason = 'expired'
    where document_file_id = p_document_file_id
      and is_active = true
      and expires_at <= now();

    -- 2. Try to select the active lock (if any) for update.
    select *
    into v_lock
    from document_locks
    where document_file_id = p_document_file_id
      and is_active = true
    for update;

    -- 3. If there is an active lock, check who owns it.
    if found then
        if v_lock.locked_by = p_user_id then
            -- Renew the lease for the same user.
            update document_locks
            set
                heartbeat_at = now(),
                expires_at = now() + make_interval(secs => p_lease_seconds)
            where id = v_lock.id
            returning * into v_lock;

            return jsonb_build_object(
                'acquired', true,
                'lock_id', v_lock.id,
                'lock_token', v_lock.lock_token,
                'owner', v_lock.locked_by,
                'expires_at', v_lock.expires_at
            );
        end if;

        -- Locked by someone else — return denial.
        return jsonb_build_object(
            'acquired', false,
            'owner', v_lock.locked_by,
            'expires_at', v_lock.expires_at
        );
    end if;

    -- 4. No active lock exists — create a new one.
    insert into document_locks (
        project_id,
        document_id,
        version_id,
        document_file_id,
        locked_by,
        expires_at
    )
    select
        project_id,
        document_id,
        version_id,
        id,
        p_user_id,
        now() + make_interval(secs => p_lease_seconds)
    from document_files
    where id = p_document_file_id
    returning * into v_lock;

    return jsonb_build_object(
        'acquired', true,
        'lock_id', v_lock.id,
        'lock_token', v_lock.lock_token,
        'owner', v_lock.locked_by,
        'expires_at', v_lock.expires_at
    );
end;
$$;
