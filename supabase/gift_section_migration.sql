-- Ejecutar una vez en el SQL Editor de Supabase para administrar esta sección.

insert into public.site_content (key, value) values
  ('gift_title', 'Un detalle especial para cada ocasión'),
  ('gift_description_1', 'Nuestros accesorios son una opción especial para regalar algo lindo, personal y con significado.'),
  ('gift_description_2', 'Realizamos ventas minoristas y también preparamos pedidos para eventos especiales como cumpleaños de 15, celebraciones, souvenirs o detalles para invitados.'),
  ('gift_description_3', 'Podés elegir pulseras, charms y combinaciones personalizadas para crear un regalo único.')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
