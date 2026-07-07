-- Actualizacion de stock solicitada el 2026-07-07.
-- Ejecutar en Supabase > SQL Editor.
--
-- Deja publicado solo lo listado abajo.
-- Todo lo demas queda sin stock y no publicado.

alter table public.products
  add column if not exists size_stock jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';

begin;

create temporary table desired_stock (
  name text primary key,
  stock integer not null,
  size_stock jsonb not null default '{}'::jsonb,
  product_type text not null
) on commit drop;

insert into desired_stock (name, stock, size_stock, product_type) values
  ('Pulsera Pandora Clasica', 2, '{"18 cm": 1, "19 cm": 1, "20 cm": 0}'::jsonb, 'base'),
  ('Pulsera Pandora Corazon', 4, '{"18 cm": 2, "19 cm": 2, "20 cm": 0}'::jsonb, 'base'),
  ('Charm Mickey', 2, '{}'::jsonb, 'charm'),
  ('Charm Bola Pandora Shine', 1, '{}'::jsonb, 'charm'),
  ('Charm O Pandora', 1, '{}'::jsonb, 'charm'),
  ('Charm Bolsa Pandora', 1, '{}'::jsonb, 'charm'),
  ('Charm Corazon Colgante Pandora', 2, '{}'::jsonb, 'charm'),
  ('Charm Corazon Pandora Shine', 1, '{}'::jsonb, 'charm'),
  ('Charm Perrito', 1, '{}'::jsonb, 'charm'),
  ('Charm Arbol de la Vida', 1, '{}'::jsonb, 'charm');

do $$
declare
  missing_names text;
begin
  select string_agg(desired_stock.name, ', ' order by desired_stock.name)
  into missing_names
  from desired_stock
  left join public.products
    on lower(regexp_replace(public.products.name, '\s+', ' ', 'g')) =
       lower(regexp_replace(desired_stock.name, '\s+', ' ', 'g'))
  where public.products.id is null;

  if missing_names is not null then
    raise exception 'No encontre estos productos: %', missing_names;
  end if;
end $$;

update public.products
set
  stock = 0,
  size_stock = '{}'::jsonb,
  published = false,
  updated_at = now();

update public.products
set
  stock = desired_stock.stock,
  size_stock = desired_stock.size_stock,
  product_type = desired_stock.product_type,
  published = true,
  updated_at = now()
from desired_stock
where lower(regexp_replace(public.products.name, '\s+', ' ', 'g')) =
      lower(regexp_replace(desired_stock.name, '\s+', ' ', 'g'));

commit;

select id, name, stock, size_stock, published
from public.products
order by published desc, name;
