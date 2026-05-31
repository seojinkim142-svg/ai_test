create table if not exists public.billing_subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  status text not null default 'pending',
  cid text,
  sid text,
  tid text,
  plan_tier text,
  billing_months integer not null default 1,
  amount integer not null default 0,
  first_order_id text,
  last_order_id text,
  approved_at timestamptz,
  next_charge_at timestamptz,
  last_charged_at timestamptz,
  cancelled_at timestamptz,
  status_checked_at timestamptz,
  approval_payload jsonb not null default '{}'::jsonb,
  status_payload jsonb not null default '{}'::jsonb,
  charge_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_provider_check check (provider in ('kakaopay')),
  constraint billing_subscriptions_status_check check (
    status in ('pending', 'active', 'past_due', 'cancelled')
  ),
  constraint billing_subscriptions_billing_months_check check (billing_months >= 1 and billing_months <= 24),
  constraint billing_subscriptions_amount_check check (amount >= 0),
  constraint billing_subscriptions_user_provider_key unique (user_id, provider)
);

create unique index if not exists billing_subscriptions_provider_sid_idx
  on public.billing_subscriptions (provider, sid)
  where sid is not null;

create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions (status);

create index if not exists billing_subscriptions_next_charge_idx
  on public.billing_subscriptions (next_charge_at);
