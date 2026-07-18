-- Ejecutar una vez en el SQL Editor de Supabase.
-- Agrega recetas de productos compuestos y descuento transaccional de componentes.

alter table public.products
  add column if not exists product_type text not null default 'simple'
  check (product_type in ('simple', 'charm', 'base', 'composite'));

create table if not exists public.product_components (
  composite_product_id bigint not null references public.products(id) on delete cascade,
  component_product_id bigint not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (composite_product_id, component_product_id),
  check (composite_product_id <> component_product_id)
);

alter table public.product_components enable row level security;

drop policy if exists "Admin gestiona componentes" on public.product_components;
create policy "Admin gestiona componentes"
on public.product_components for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.get_store_products()
returns table (
  id bigint, name text, category text, price numeric, old_price numeric,
  badge text, image_url text, stock integer, published boolean,
  sort_order integer, created_at timestamptz, updated_at timestamptz,
  gallery_urls text[], product_type text, available_stock integer
)
language sql stable security definer set search_path = ''
as $$
  select
    p.id, p.name, p.category, p.price, p.old_price, p.badge, p.image_url,
    p.stock, p.published, p.sort_order, p.created_at, p.updated_at,
    p.gallery_urls, p.product_type,
    case when p.product_type = 'composite' then coalesce((
      select min(floor(component.stock::numeric / recipe.quantity))::integer
      from public.product_components recipe
      join public.products component on component.id = recipe.component_product_id
      where recipe.composite_product_id = p.id
    ), 0) else p.stock end as available_stock
  from public.products p
  where p.published = true
  order by p.sort_order, p.id;
$$;

revoke all on function public.get_store_products() from public;
grant execute on function public.get_store_products() to anon, authenticated;

create or replace function public.validate_cart_stock(p_items jsonb)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare item jsonb; item_id bigint; item_quantity integer; ordered_type text;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then return false; end if;
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    item_id := (item->>'id')::bigint;
    item_quantity := (item->>'quantity')::integer;
    select product_type into ordered_type from public.products where id = item_id and published = true;
    if ordered_type is null or item_quantity is null or item_quantity <= 0 then return false; end if;
    if ordered_type = 'composite' and not exists (
      select 1 from public.product_components where composite_product_id = item_id
    ) then return false; end if;
  end loop;
  return not exists (
    with order_items as (
      select (entry->>'id')::bigint product_id, (entry->>'quantity')::integer quantity
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) entry
    ), physical_requirements as (
      select ordered.id product_id, order_items.quantity
      from order_items join public.products ordered on ordered.id = order_items.product_id
      where ordered.product_type <> 'composite'
      union all
      select recipe.component_product_id, order_items.quantity * recipe.quantity
      from order_items
      join public.products ordered on ordered.id = order_items.product_id
      join public.product_components recipe on recipe.composite_product_id = ordered.id
      where ordered.product_type = 'composite'
    ), totals as (
      select product_id, sum(quantity)::integer quantity from physical_requirements group by product_id
    )
    select 1 from totals join public.products component on component.id = totals.product_id
    where component.product_type = 'composite' or component.stock < totals.quantity
  );
end;
$$;

revoke all on function public.validate_cart_stock(jsonb) from public;
grant execute on function public.validate_cart_stock(jsonb) to anon, authenticated;

create or replace function public.replace_product_components(p_product_id bigint, p_components jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_type text;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select product_type into current_type from public.products where id = p_product_id;
  if current_type is null then raise exception 'Producto inexistente'; end if;
  if jsonb_typeof(coalesce(p_components, '[]'::jsonb)) <> 'array' then
    raise exception 'La composición debe ser una lista';
  end if;
  if current_type <> 'composite' and jsonb_array_length(coalesce(p_components, '[]'::jsonb)) > 0 then
    raise exception 'Solo los productos compuestos pueden tener componentes';
  end if;
  if current_type = 'composite' and jsonb_array_length(coalesce(p_components, '[]'::jsonb)) = 0 then
    raise exception 'El producto compuesto necesita al menos un componente';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) item
    left join public.products component on component.id = (item->>'productId')::bigint
    where component.id is null or component.id = p_product_id
      or component.product_type = 'composite'
      or coalesce((item->>'quantity')::integer, 0) <= 0
  ) then raise exception 'La composición contiene productos o cantidades inválidas'; end if;
  delete from public.product_components where composite_product_id = p_product_id;
  insert into public.product_components (composite_product_id, component_product_id, quantity)
  select p_product_id, (item->>'productId')::bigint, sum((item->>'quantity')::integer)
  from jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) item
  group by (item->>'productId')::bigint;
end;
$$;

revoke all on function public.replace_product_components(bigint, jsonb) from public;
grant execute on function public.replace_product_components(bigint, jsonb) to authenticated;

create or replace function public.decrease_stock_for_order()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  item jsonb; item_id bigint; item_quantity integer; ordered_type text; requirement record;
begin
  for item in select * from jsonb_array_elements(new.items) loop
    item_id := (item->>'id')::bigint;
    item_quantity := (item->>'quantity')::integer;
    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Cantidad inválida para el producto %', item_id;
    end if;
    select product_type into ordered_type from public.products where id = item_id and published = true;
    if ordered_type is null then raise exception 'Producto inexistente: %', item_id; end if;
    if ordered_type = 'composite' and not exists (
      select 1 from public.product_components where composite_product_id = item_id
    ) then raise exception 'El producto compuesto % no tiene componentes', item_id; end if;
  end loop;

  for requirement in
    with order_items as (
      select (item->>'id')::bigint product_id, (item->>'quantity')::integer quantity
      from jsonb_array_elements(new.items) item
    ), physical_requirements as (
      select ordered.id product_id, order_items.quantity
      from order_items join public.products ordered on ordered.id = order_items.product_id
      where ordered.product_type <> 'composite'
      union all
      select recipe.component_product_id, order_items.quantity * recipe.quantity
      from order_items
      join public.products ordered on ordered.id = order_items.product_id
      join public.product_components recipe on recipe.composite_product_id = ordered.id
      where ordered.product_type = 'composite'
    )
    select product_id, sum(quantity)::integer quantity
    from physical_requirements group by product_id order by product_id
  loop
    update public.products set stock = stock - requirement.quantity, updated_at = now()
    where id = requirement.product_id and product_type <> 'composite'
      and stock >= requirement.quantity;
    if not found then
      raise exception 'Stock insuficiente para el producto %', requirement.product_id;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists decrease_stock_after_order on public.orders;
create trigger decrease_stock_after_order
before insert on public.orders
for each row execute function public.decrease_stock_for_order();
