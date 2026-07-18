-- Normaliza productos de categorías llamadas "brazaletes" o "pulseras" para que
-- la tienda, la validación del carrito y el descuento por talle usen el mismo tipo.
update public.products
set product_type = 'base', updated_at = now()
where product_type <> 'composite'
  and (
    lower(translate(category, 'áéíóúüñ', 'aeiouun')) like '%brazalet%'
    or lower(translate(category, 'áéíóúüñ', 'aeiouun')) like '%pulsera%'
  );

notify pgrst, 'reload schema';
