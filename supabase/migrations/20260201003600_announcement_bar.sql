-- =====================================================================
-- Announcement bar: the sale / offer strip across the very top of the
-- website, the sponsor panel and the customer panel, run from Website CMS.
--
-- Separate from cms_banners (the promo cards on the home page): a bar item
-- is one line with a badge, an optional coupon code, a countdown to its end
-- and a call to action, rotated with the others that are live.
-- =====================================================================

create table if not exists public.cms_announcements (
  id            uuid primary key default gen_random_uuid(),
  message       text not null,
  badge         text,                          -- "FLAT 10% OFF", "NEW LAUNCH"
  emoji         text,                          -- shown before the badge
  coupon_code   text,
  cta_label     text,
  cta_link      text,
  theme         text not null default 'gold'
                check (theme in ('gold', 'sale', 'festive', 'leaf', 'midnight', 'royal')),
  show_countdown boolean not null default true, -- counts down to ends_at when set
  show_website  boolean not null default true,
  show_sponsor  boolean not null default true,
  show_customer boolean not null default false,
  starts_at     timestamptz,
  ends_at       timestamptz,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cms_announcements_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists cms_announcements_live_idx on public.cms_announcements (active, sort_order);

alter table public.cms_announcements enable row level security;

-- Visitors may not call app.is_admin(), so they get their own plain rule.
drop policy if exists cms_announcements_read on public.cms_announcements;
drop policy if exists cms_announcements_read_anon on public.cms_announcements;
create policy cms_announcements_read_anon on public.cms_announcements for select to anon
  using (active);
drop policy if exists cms_announcements_read_auth on public.cms_announcements;
create policy cms_announcements_read_auth on public.cms_announcements for select to authenticated
  using (active or app.is_admin());

drop policy if exists cms_announcements_admin on public.cms_announcements;
create policy cms_announcements_admin on public.cms_announcements for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

drop trigger if exists trg_cms_announcements_touch on public.cms_announcements;
create trigger trg_cms_announcements_touch
  before update on public.cms_announcements
  for each row execute function app.touch_updated_at();

-- Starter content. Only the first is switched on: it repeats what the
-- website already says. The sale templates stay off until the office fills
-- in a real offer.
insert into public.cms_announcements (message, badge, emoji, cta_label, cta_link, theme, show_countdown, active, sort_order, created_by)
select * from (values
  ('Mission 90 Days training — registrations are open. Join as a channel partner today!', 'NOW OPEN', '🚀', 'Join now', '/join', 'gold', false, true, 0, null::uuid),
  ('Festive offer on plots at Manglam City — limited plots at this price.', 'FESTIVE OFFER', '🎉', 'View plots', '/projects', 'festive', true, false, 1, null::uuid),
  ('Book your plot this week and save on the booking amount.', 'FLAT 10% OFF', '🔥', 'Book now', '/projects', 'sale', true, false, 2, null::uuid)
) as seed(message, badge, emoji, cta_label, cta_link, theme, show_countdown, active, sort_order, created_by)
where not exists (select 1 from public.cms_announcements);
