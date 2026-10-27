-- SnapKYC Video schema. Run once in the Supabase SQL editor.

create table if not exists public.kyc_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'consented'
    check (status in ('consented', 'id_verified', 'in_call', 'pending_review', 'approved', 'rejected')),
  created_at timestamptz not null default now(),

  -- V-CIP: consent first, customer is in India
  consent_text text not null,
  consent_given_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  location_accuracy_m double precision,
  location_captured_at timestamptz not null,
  in_india boolean not null,

  -- Mock SnapKYC result. The Aadhaar number itself is never stored.
  snapkyc_ref text,
  customer_name text,
  customer_dob date,
  customer_photo text,
  id_verified_at timestamptz,

  -- Video call (maker)
  agent_id text,
  call_started_at timestamptz,
  questions jsonb,
  snapshot_path text,
  snapshot_taken_at timestamptz,
  recording_path text,
  recording_saved_at timestamptz,
  recommendation text check (recommendation in ('approve', 'reject')),
  agent_notes text,
  recommended_at timestamptz,

  -- Review (checker)
  reviewer_id text,
  decision text check (decision in ('approved', 'rejected')),
  decision_reason text,
  decided_at timestamptz,
  kyc_token text,
  token_expires_at timestamptz,

  -- Maker-checker is enforced by the API and again by the database.
  constraint maker_checker check (reviewer_id is null or reviewer_id <> agent_id)
);

create index if not exists kyc_sessions_status_idx
  on public.kyc_sessions (status, created_at desc);

-- No policies: only the server (service-role key) can read or write.
alter table public.kyc_sessions enable row level security;

-- Private bucket for call recordings and face snapshots.
insert into storage.buckets (id, name, public, file_size_limit)
values ('kyc-media', 'kyc-media', false, 52428800)
on conflict (id) do nothing;
