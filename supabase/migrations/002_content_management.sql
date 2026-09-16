-- Gestión editorial de eventos y planes.
-- Ejecutar después de 001_eventosonic.sql.

alter table public.events
  add column if not exists is_visible boolean not null default true;

drop policy if exists "events are public" on public.events;
drop policy if exists "visible events are public" on public.events;
create policy "visible events are public" on public.events
for select to anon using (is_visible);

drop policy if exists "admins read all events" on public.events;
create policy "admins read all events" on public.events
for select to authenticated using (is_visible or (select public.is_app_admin()));

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 100),
  icon text not null default 'ES' check (char_length(icon) between 1 and 4),
  price integer not null check (price >= 0),
  short_description text not null default '',
  hero_title text not null,
  hero_description text not null default '',
  includes_title text not null default 'Todo lo que incluye este plan',
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  extras jsonb not null default '[]'::jsonb check (jsonb_typeof(extras) = 'array'),
  is_featured boolean not null default false,
  featured_label text not null default 'Más popular',
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans
for each row execute function public.set_updated_at();

alter table public.plans enable row level security;

drop policy if exists "visible plans are public" on public.plans;
create policy "visible plans are public" on public.plans
for select to anon using (is_visible);

drop policy if exists "admins read all plans" on public.plans;
create policy "admins read all plans" on public.plans
for select to authenticated using (is_visible or (select public.is_app_admin()));

drop policy if exists "admins create plans" on public.plans;
create policy "admins create plans" on public.plans
for insert to authenticated
with check ((select public.is_app_admin()) and created_by = (select auth.uid()));

drop policy if exists "admins update plans" on public.plans;
create policy "admins update plans" on public.plans
for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "admins delete plans" on public.plans;
create policy "admins delete plans" on public.plans
for delete to authenticated using ((select public.is_app_admin()));

insert into public.plans (
  slug, name, icon, price, short_description, hero_title, hero_description,
  includes_title, features, extras, is_featured, featured_label, sort_order
)
values
(
  'esencial',
  'Plan Esencial',
  'ES',
  150,
  'Perfecto para celebraciones íntimas y eventos pequeños',
  'La base perfecta para una celebración íntima y cuidada',
  'Diseñamos una mesa dulce elegante, proporcionada al tamaño de tu evento y con una estética completamente personalizada. Nos ocupamos del montaje y desmontaje para que solo tengas que disfrutar. Ideal para cumpleaños privados, reuniones familiares y pequeños encuentros con encanto.',
  'Todo lo necesario para un montaje bonito y funcional',
  '["Hasta 30 personas", "Mesa hasta 2 metros", "5 tipos de dulces seleccionados", "Menaje básico y presentación elegante", "Decoración coordinada con tu temática", "Montaje y desmontaje incluidos"]'::jsonb,
  '[{"name":"Tarta personalizada","price":80,"description":"Tarta decorada a juego con la temática"},{"name":"Photocall temático","price":120,"description":"Marco decorativo para las fotos del evento"},{"name":"Iluminación especial","price":60,"description":"Luces LED y guirnaldas para ambientar"},{"name":"Servicio de camarero","price":150,"description":"Personal de servicio durante el evento"},{"name":"Globos y decoración adicional","price":50,"description":"Arcos y columnas de globos"},{"name":"Fotografía del evento","price":200,"description":"Reportaje fotográfico profesional"}]'::jsonb,
  false,
  'Más popular',
  10
),
(
  'premium',
  'Plan Premium',
  'PR',
  750,
  'Ideal para bodas, comuniones y eventos medianos',
  'La opción favorita para bodas, comuniones y celebraciones medianas',
  'Elevamos la propuesta con más variedad de dulces y salados, menaje exclusivo y una decoración temática más completa. Diseñamos un montaje con presencia, armonía y personalidad para que tu evento destaque desde el primer vistazo. Es el equilibrio perfecto entre impacto visual, sabor y comodidad.',
  'Una experiencia más completa y decorativa',
  '["Hasta 80 personas", "Mesa hasta 4 metros", "10 o más tipos de dulces y salados", "Menaje exclusivo y presentación premium", "Decoración temática personalizada", "Montaje y desmontaje incluidos"]'::jsonb,
  '[{"name":"Tarta personalizada","price":80,"description":"Tarta decorada a juego con la temática"},{"name":"Photocall temático","price":120,"description":"Marco decorativo para las fotos del evento"},{"name":"Iluminación especial","price":60,"description":"Luces LED y guirnaldas para ambientar"},{"name":"Servicio de camarero","price":150,"description":"Personal de servicio durante el evento"},{"name":"Globos y decoración adicional","price":50,"description":"Arcos y columnas de globos"},{"name":"Fotografía del evento","price":200,"description":"Reportaje fotográfico profesional"}]'::jsonb,
  true,
  'Más popular',
  20
),
(
  'total',
  'Plan Total',
  'TT',
  1500,
  'Experiencia completa para grandes celebraciones y empresas',
  'Una experiencia integral pensada para eventos grandes y sin límites',
  'Diseñamos una mesa a medida que puede combinar dulces, salados, bebidas y una puesta en escena completa del espacio. Coordinamos decoración, proveedores y cada detalle visual para que el evento transmita exactamente lo que imaginas. Es la propuesta más ambiciosa de EventoSonic para marcas, bodas amplias y celebraciones de gran formato.',
  'Un servicio completo con máxima personalización',
  '["Personas ilimitadas", "Mesa a medida según espacio y concepto", "Dulces, salados y bebidas", "Decoración completa del espacio", "Coordinación con proveedores", "Montaje y desmontaje integral"]'::jsonb,
  '[{"name":"Tarta personalizada","price":80,"description":"Tarta decorada a juego con la temática"},{"name":"Photocall temático","price":120,"description":"Marco decorativo para las fotos del evento"},{"name":"Iluminación especial","price":60,"description":"Luces LED y guirnaldas para ambientar"},{"name":"Servicio de camarero","price":150,"description":"Personal de servicio durante el evento"},{"name":"Globos y decoración adicional","price":50,"description":"Arcos y columnas de globos"},{"name":"Fotografía del evento","price":200,"description":"Reportaje fotográfico profesional"}]'::jsonb,
  false,
  'Más popular',
  30
)
on conflict (slug) do nothing;
