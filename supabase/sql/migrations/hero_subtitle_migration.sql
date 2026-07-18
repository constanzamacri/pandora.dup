-- Ejecutar una vez en el SQL Editor de Supabase para separar título y subtítulo.

insert into public.site_content (key, value) values
  ('hero_title', 'Armá tu pulsera'),
  ('hero_subtitle', 'Combiná tus charms preferidos')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
