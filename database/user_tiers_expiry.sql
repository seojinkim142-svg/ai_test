-- Adds subscription expiry support for paid tiers (pro/premium).
-- Safe to run multiple times.

alter table if exists public.user_tiers
  add column if not exists tier_expires_at timestamptz;

comment on column public.user_tiers.tier_expires_at is
  'Paid plan expiration timestamp (UTC). Keep NULL for free tier.';

-- Normalize existing free users.
update public.user_tiers
set tier_expires_at = null
where tier = 'free'
  and tier_expires_at is not null;

create index if not exists user_tiers_tier_expires_at_idx
  on public.user_tiers (tier_expires_at);
