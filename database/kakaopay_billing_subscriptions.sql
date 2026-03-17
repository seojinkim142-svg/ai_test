-- Stores KakaoPay recurring billing subscriptions (sid) per user.

create table if not exists public.billing_subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'kakaopay',
  status text not null default 'active',
  tier text not null,
  billing_months integer not null default 1,
  amount integer not null,
  cid text not null,
  sid text not null,
  item_name text,
  approved_at timestamptz,
  last_charge_at timestamptz,
  next_charge_at timestamptz,
  retry_after_at timestamptz,
  last_failed_at timestamptz,
  last_order_id text,
  last_tid text,
  cancelled_at timestamptz,
  cancel_reason text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  raw_approve jsonb,
  raw_charge jsonb,
  raw_inactive jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_provider_user_id_key unique (provider, user_id),
  constraint billing_subscriptions_provider_sid_key unique (provider, sid),
  constraint billing_subscriptions_status_check check (status in ('active', 'inactive')),
  constraint billing_subscriptions_tier_check check (lower(tier) in ('pro', 'premium')),
  constraint billing_subscriptions_billing_months_check check (billing_months >= 1 and billing_months <= 24),
  constraint billing_subscriptions_amount_check check (amount > 0)
);

create index if not exists billing_subscriptions_user_status_idx
  on public.billing_subscriptions (user_id, status);

create index if not exists billing_subscriptions_next_charge_idx
  on public.billing_subscriptions (provider, status, next_charge_at);

comment on table public.billing_subscriptions is
  'Server-side KakaoPay recurring billing subscriptions keyed by user.';

comment on column public.billing_subscriptions.sid is
  'KakaoPay recurring billing SID issued after the initial subscription registration approval.';

comment on column public.billing_subscriptions.next_charge_at is
  'Next scheduled recurring charge timestamp (UTC).';
