-- Actualizacion de stock solicitada el 2026-07-07.
-- Ejecutar en Supabase > SQL Editor.
--
-- Este archivo usa stock por talle para las pulseras/brazaletes.
-- Antes de ejecutarlo, aplicar el esquema actualizado para crear products.size_stock.

begin;

update public.products
set
  stock = 0,
  size_stock = '{}'::jsonb,
  published = false,
  updated_at = now();

update public.products
set
  stock = case id
    when 22 then 2 -- Pulsera Pandora Clasica: 18 cm (1) + 19 cm (1)
    when 21 then 4 -- Pulsera Pandora Corazon: 18 cm (2) + 19 cm (2)
    when 1 then 2 -- Charm Mickey
    when 5 then 1 -- Charm Bola Pandora Shine
    when 2 then 1 -- Charm O Pandora
    when 3 then 1 -- Charm Bolsa Pandora
    when 6 then 2 -- Charm Corazon Colgante Pandora
    when 4 then 1 -- Charm Corazon Pandora Shine
    when 15 then 1 -- Charm Perrito
    when 17 then 1 -- Charm Arbol de la Vida
  end,
  size_stock = case id
    when 22 then '{"18 cm": 1, "19 cm": 1}'::jsonb -- Pulsera Pandora Clasica
    when 21 then '{"18 cm": 2, "19 cm": 2}'::jsonb -- Pulsera Pandora Corazon
    else '{}'::jsonb
  end,
  published = true,
  updated_at = now()
where id in (22, 21, 1, 5, 2, 3, 6, 4, 15, 17);

commit;

select id, name, stock, size_stock, published
from public.products
order by published desc, name;
