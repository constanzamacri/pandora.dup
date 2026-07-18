-- Corrige el stock por talle de los combos.
-- Un talle solo está disponible si también hay stock de todos los demás componentes.

create or replace function public.get_store_products()
returns table (
  id bigint,
  name text,
  category text,
  price numeric,
  old_price numeric,
  badge text,
  image_url text,
  stock integer,
  published boolean,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz,
  gallery_urls text[],
  product_type text,
  size_stock jsonb,
  available_size_stock jsonb,
  available_stock integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.name, p.category, p.price, p.old_price, p.badge, p.image_url,
    p.stock, p.published, p.sort_order, p.created_at, p.updated_at,
    p.gallery_urls, p.product_type, p.size_stock,
    case
      when p.product_type = 'composite' then coalesce((
        select jsonb_object_agg(
          size_item.key,
          least(
            floor(coalesce((base_product.size_stock->>size_item.key)::numeric, 0) / base_recipe.quantity)::integer,
            coalesce((
              select min(floor((
                case
                  when other_component.size_stock <> '{}'::jsonb then (
                    select coalesce(sum(value::integer), 0)
                    from jsonb_each_text(other_component.size_stock)
                  )
                  else other_component.stock
                end
              )::numeric / other_recipe.quantity))::integer
              from public.product_components other_recipe
              join public.products other_component on other_component.id = other_recipe.component_product_id
              where other_recipe.composite_product_id = p.id
                and other_recipe.component_product_id <> base_recipe.component_product_id
            ), floor(coalesce((base_product.size_stock->>size_item.key)::numeric, 0) / base_recipe.quantity)::integer)
          )
        )
        from public.product_components base_recipe
        join public.products base_product on base_product.id = base_recipe.component_product_id
        cross join jsonb_each_text(base_product.size_stock) as size_item(key, value)
        where base_recipe.composite_product_id = p.id
          and (base_product.product_type = 'base' or base_product.category = 'brazaletes')
      ), '{}'::jsonb)
      else coalesce(p.size_stock, '{}'::jsonb)
    end as available_size_stock,
    case
      when p.product_type = 'composite' then coalesce((
        select min(floor((
          case
            when component.size_stock <> '{}'::jsonb then (
              select coalesce(sum(value::integer), 0)
              from jsonb_each_text(component.size_stock)
            )
            else component.stock
          end
        )::numeric / recipe.quantity))::integer
        from public.product_components recipe
        join public.products component on component.id = recipe.component_product_id
        where recipe.composite_product_id = p.id
      ), 0)
      when p.size_stock <> '{}'::jsonb then (
        select coalesce(sum(value::integer), 0)::integer
        from jsonb_each_text(p.size_stock)
      )
      else p.stock
    end as available_stock
  from public.products p
  where p.published = true
  order by p.sort_order, p.id;
$$;

revoke all on function public.get_store_products() from public;
grant execute on function public.get_store_products() to anon, authenticated;
