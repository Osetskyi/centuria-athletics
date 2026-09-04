create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_announcement_reads (
  announcement_id uuid not null references public.site_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- RLS is installed by migration site_announcements_fullscreen_once.
