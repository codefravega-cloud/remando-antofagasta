-- Remando Antofagasta · esquema de producción
-- Ejecutar en Supabase SQL Editor una vez que se haya reemplazado
-- YOUR_ADMIN_EMAIL@example.com por el correo del instructor.
-- Nunca expongas service_role ni contraseñas en la landing.

create extension if not exists pgcrypto;

create table if not exists public.services (
  id text primary key,
  name text not null,
  detail text not null,
  price integer check (price is null or price >= 0),
  label text not null,
  featured boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  service_id text not null references public.services(id) on delete restrict,
  capacity integer not null check (capacity between 1 and 32),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text not null check (char_length(trim(phone)) between 6 and 40),
  email text,
  age integer not null check (age between 12 and 100),
  emergency_name text not null check (char_length(trim(emergency_name)) between 2 and 120),
  emergency_phone text not null check (char_length(trim(emergency_phone)) between 6 and 40),
  health_info text check (health_info is null or char_length(health_info) <= 2000),
  consent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- Solo los usuarios autenticados que fueron aprobados pueden administrar.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.services enable row level security;
alter table public.slots enable row level security;
alter table public.bookings enable row level security;
alter table public.admin_users enable row level security;
alter table public.business_settings enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Lectura pública: servicios visibles y horarios activos. Las reservas no son públicas.
drop policy if exists "public can read active services" on public.services;
create policy "public can read active services" on public.services
  for select using (active = true);

drop policy if exists "public can read active slots" on public.slots;
create policy "public can read active slots" on public.slots
  for select using (active = true and starts_at > now() - interval '2 hours');

drop policy if exists "admins manage services" on public.services;
create policy "admins manage services" on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage slots" on public.slots;
create policy "admins manage slots" on public.slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read and manage bookings" on public.bookings;
create policy "admins read and manage bookings" on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read their role" on public.admin_users;
create policy "admins read their role" on public.admin_users
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "public can read business contact" on public.business_settings;
create policy "public can read business contact" on public.business_settings
  for select using (key in ('whatsappNumber', 'location'));

drop policy if exists "admins manage business settings" on public.business_settings;
create policy "admins manage business settings" on public.business_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Devuelve solamente cupos restantes; nunca datos de quienes ya reservaron.
create or replace function public.available_slots()
returns table (
  id uuid,
  starts_at timestamptz,
  capacity integer,
  remaining integer,
  service_id text,
  service_name text,
  service_detail text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.starts_at, s.capacity,
         s.capacity - count(b.id) filter (where b.status <> 'cancelled')::integer as remaining,
         v.id, v.name, v.detail
    from public.slots s
    join public.services v on v.id = s.service_id and v.active = true
    left join public.bookings b on b.slot_id = s.id
   where s.active = true and s.starts_at > now() - interval '2 hours'
   group by s.id, v.id
  having s.capacity - count(b.id) filter (where b.status <> 'cancelled') > 0
   order by s.starts_at;
$$;

grant execute on function public.available_slots() to anon, authenticated;

-- Inserción atómica: bloquea el horario durante la comprobación para no vender
-- un cupo dos veces. La landing solo obtiene un identificador de solicitud.
create or replace function public.create_booking(
  p_slot_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_age integer,
  p_emergency_name text,
  p_emergency_phone text,
  p_health_info text,
  p_consent_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_slot public.slots%rowtype;
  active_bookings integer;
  new_booking_id uuid;
begin
  if p_consent_at is null then
    raise exception 'Debes aceptar el uso de datos para seguridad.' using errcode = '22023';
  end if;

  select * into selected_slot
    from public.slots
   where id = p_slot_id and active = true and starts_at > now() - interval '2 hours'
   for update;

  if not found then
    raise exception 'Este horario ya no está disponible.' using errcode = '22023';
  end if;

  select count(*) into active_bookings
    from public.bookings
   where slot_id = selected_slot.id and status <> 'cancelled';

  if active_bookings >= selected_slot.capacity then
    raise exception 'Ese horario acaba de llenarse.' using errcode = '22023';
  end if;

  insert into public.bookings (
    slot_id, name, phone, email, age, emergency_name, emergency_phone,
    health_info, consent_at
  ) values (
    selected_slot.id, trim(p_name), trim(p_phone), nullif(trim(p_email), ''), p_age,
    trim(p_emergency_name), trim(p_emergency_phone), nullif(trim(p_health_info), ''),
    p_consent_at
  ) returning id into new_booking_id;

  return new_booking_id;
end;
$$;

revoke all on function public.create_booking(uuid, text, text, text, integer, text, text, text, timestamptz) from public;
grant execute on function public.create_booking(uuid, text, text, text, integer, text, text, text, timestamptz) to anon, authenticated;

-- Agenda semanal: cada regla se replica desde el lunes vigente hasta el lunes siguiente.
create table if not exists public.weekly_slot_templates (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6), -- 0 domingo, 1 lunes
  starts_time time not null,
  service_id text not null references public.services(id) on delete restrict,
  capacity integer not null check (capacity between 1 and 32),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekday, starts_time, service_id)
);

alter table public.weekly_slot_templates enable row level security;
drop policy if exists "admins manage weekly templates" on public.weekly_slot_templates;
create policy "admins manage weekly templates" on public.weekly_slot_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Caja: ingresos que el instructor registra manualmente (efectivo, transferencias o abonos).
create table if not exists public.manual_income_entries (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 0) not null check (amount > 0),
  entry_date date not null default current_date,
  category text not null default 'otro' check (category in ('transferencia', 'efectivo', 'abono', 'otro')),
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.manual_income_entries enable row level security;
drop policy if exists "admins manage manual income" on public.manual_income_entries;
create policy "admins manage manual income" on public.manual_income_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Ficha de cada clase registrada manualmente: mantiene los datos necesarios para operar con seguridad.
alter table public.manual_income_entries
  add column if not exists client_name text,
  add column if not exists client_phone text,
  add column if not exists service_name text,
  add column if not exists class_date date,
  add column if not exists class_time time,
  add column if not exists participants integer check (participants > 0),
  add column if not exists emergency_name text,
  add column if not exists emergency_phone text,
  add column if not exists health_info text;

create or replace function public.refresh_booking_week()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date := date_trunc('week', timezone('America/Santiago', now()))::date;
  v_inserted integer := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  insert into public.slots (starts_at, service_id, capacity, active)
  select ((d::date + t.starts_time) at time zone 'America/Santiago'),
         t.service_id, t.capacity, true
    from generate_series(v_week_start, v_week_start + 7, interval '1 day') d
    join public.weekly_slot_templates t
      on extract(dow from d)::smallint = t.weekday and t.active
   where ((d::date + t.starts_time) at time zone 'America/Santiago') > now()
     and not exists (
       select 1 from public.slots s
        where s.starts_at = ((d::date + t.starts_time) at time zone 'America/Santiago')
          and s.service_id = t.service_id
     );
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.refresh_booking_week() to authenticated;

-- La agenda pública sólo muestra desde el lunes actual hasta el próximo lunes inclusive.
create or replace function public.available_slots()
returns table (
  id uuid,
  starts_at timestamptz,
  capacity integer,
  remaining integer,
  service_id text,
  service_name text,
  service_detail text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.starts_at, s.capacity,
         s.capacity - count(b.id) filter (where b.status <> 'cancelled')::integer as remaining,
         v.id, v.name, v.detail
    from public.slots s
    join public.services v on v.id = s.service_id and v.active = true
    left join public.bookings b on b.slot_id = s.id
   where s.active = true
     and s.starts_at > now()
     and s.starts_at >= (date_trunc('week', timezone('America/Santiago', now())) at time zone 'America/Santiago')
     and s.starts_at < ((date_trunc('week', timezone('America/Santiago', now())) + interval '8 days') at time zone 'America/Santiago')
   group by s.id, v.id
  having s.capacity - count(b.id) filter (where b.status <> 'cancelled') > 0
   order by s.starts_at;
$$;

-- Se ejecuta cada hora: así se respeta America/Santiago también cuando cambia el horario de verano.
do $$
declare v_job_id bigint;
begin
  begin
    create extension if not exists pg_cron with schema extensions;
    select jobid into v_job_id from cron.job where jobname = 'remando-refresh-booking-week';
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    perform cron.schedule('remando-refresh-booking-week', '5 * * * *', 'select public.refresh_booking_week();');
  exception when insufficient_privilege or undefined_function or undefined_table then
    raise notice 'pg_cron no disponible; ejecuta refresh_booking_week desde el panel al editar horarios.';
  end;
end;
$$;

-- Catálogo inicial. Es editable desde el panel una vez que el instructor tenga rol.
insert into public.services (id, name, detail, price, label, featured, sort_order)
values
  ('clase', 'Clase SUP', '1 hora · con guía', 8000, 'por persona', false, 10),
  ('arriendo-30', 'Arriendo de tabla', '30 minutos · sin guía', 5000, 'por tabla', false, 20),
  ('arriendo-60', 'Arriendo de tabla', '60 minutos · sin guía', 10000, 'por tabla', false, 30),
  ('barco', 'Paseo guiado al barco', 'Salida guiada · según condiciones', 10000, 'por persona', false, 40),
  ('tour', 'Paseo amanecer o atardecer', 'Salida guiada · según condiciones', 20000, 'por persona', true, 50),
  ('yoga', 'Clase de Yoga SUP', 'Jueves, sábado y domingo · según clima', 20000, 'por persona', false, 60)
on conflict (id) do update set
  name = excluded.name,
  detail = excluded.detail,
  price = excluded.price,
  label = excluded.label,
  featured = excluded.featured,
  sort_order = excluded.sort_order;

insert into public.business_settings (key, value) values
  ('location', 'Balneario Municipal, Antofagasta'),
  ('whatsappNumber', '')
on conflict (key) do nothing;

-- Al crear el usuario de acceso del instructor por enlace mágico, ejecuta una sola vez:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL@example.com'
-- on conflict do nothing;
