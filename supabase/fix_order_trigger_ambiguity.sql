create or replace function public.decrease_stock_for_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_item jsonb;
  item_id bigint;
  item_quantity integer;
  ordered_type text;
  requirement record;
begin
  for order_item in
    select element.value
    from jsonb_array_elements(new.items) as element(value)
  loop
    item_id := (order_item->>'id')::bigint;
    item_quantity := (order_item->>'quantity')::integer;
    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Cantidad inválida para el producto %', item_id;
    end if;
    select p.product_type into ordered_type
    from public.products as p
    where p.id = item_id and p.published = true;
    if ordered_type is null then
      raise exception 'Producto inexistente: %', item_id;
    end if;
    if ordered_type = 'composite' and not exists (
      select 1
      from public.product_components as pc
      where pc.composite_product_id = item_id
    ) then
      raise exception 'El producto compuesto % no tiene componentes', item_id;
    end if;
  end loop;

  for requirement in
    with order_items as (
      select
        (element.value->>'id')::bigint as product_id,
        (element.value->>'quantity')::integer as quantity
      from jsonb_array_elements(new.items) as element(value)
    ),
    physical_requirements as (
      select ordered.id as product_id, order_items.quantity as quantity
      from order_items
      join public.products as ordered on ordered.id = order_items.product_id
      where ordered.product_type <> 'composite'
      union all
      select recipe.component_product_id, order_items.quantity * recipe.quantity
      from order_items
      join public.products as ordered on ordered.id = order_items.product_id
      join public.product_components as recipe on recipe.composite_product_id = ordered.id
      where ordered.product_type = 'composite'
    )
    select physical_requirements.product_id, sum(physical_requirements.quantity)::integer as quantity
    from physical_requirements
    group by physical_requirements.product_id
    order by physical_requirements.product_id
  loop
    update public.products as p
    set stock = p.stock - requirement.quantity,
        updated_at = now()
    where p.id = requirement.product_id
      and p.product_type <> 'composite'
      and p.stock >= requirement.quantity;
    if not found then
      raise exception 'Stock insuficiente para el producto %', requirement.product_id;
    end if;
  end loop;
  return new;
end;
$$;
