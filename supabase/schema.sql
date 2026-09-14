-- Modelo inicial para reservas reales. Ejecutar en el SQL Editor de Supabase.
-- Nunca expongas la service_role key en el sitio público.
create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  service text not null,
  capacity integer not null check (capacity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots(id) on delete restrict,
  name text not null,
  phone text not null,
  email text,
  age integer not null check (age >= 12),
  emergency_name text not null,
  emergency_phone text not null,
  health_info text,
  consent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);

alter table public.slots enable row level security;
alter table public.bookings enable row level security;

-- Lectura pública solo de horarios abiertos. Las operaciones de reserva y administración
-- deberían ocurrir mediante una Edge Function que valide cupos y aplique rate limiting.
create policy "public can view active slots" on public.slots for select using (active = true);

-- El instructor autenticado puede administrar. Reemplaza esta comprobación por un rol/claim
-- específico o una tabla de administradores antes de operar en producción.
create policy "authenticated instructors manage slots" on public.slots for all to authenticated using (true) with check (true);
create policy "authenticated instructors manage bookings" on public.bookings for all to authenticated using (true) with check (true);
