-- Seed de prueba (ejecutado como superusuario `loop` = contexto servidor).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@loop',   '{"full_name":"Admin LOOP"}'),
  ('22222222-2222-2222-2222-222222222222', 'tecnico@loop', '{"full_name":"Tecnico"}'),
  ('33333333-3333-3333-3333-333333333333', 'mayo@loop',    '{"full_name":"Mayorista"}');

-- El trigger handle_new_user creó los profiles como PUBLICO.
-- Bootstrap del primer ADMIN (auth.uid() nulo => contexto servidor permitido).
update public.profiles set role = 'ADMIN'
  where id = '11111111-1111-1111-1111-111111111111';

insert into public.products
  (sku, nombre, marca, tipo, calidad, precio_publico, precio_mayorista,
   stock_sheet, publicado)
values
  ('MOD-X', 'Módulo X', 'Samsung', 'Módulo', 'Incell', 30000, 22000, 10, true),
  ('HID-Z', 'Oculto Z', 'Otras',   'Insumo', 'Estándar', 9999,  5000,  3, false);

insert into public.products
  (sku, nombre, marca, tipo, calidad, precio_publico, precio_promocional,
   precio_mayorista, es_promocion, stock_sheet, publicado)
values
  -- PROMO-Y: mayorista (6000) < promo (7000) -> mayorista paga 6000.
  ('PROMO-Y', 'Promo Y', 'Xiaomi', 'Tapa', 'Original', 10000, 7000, 6000,
   true, 5, true),
  -- PROMO-M: mayorista (12000) > promo (9000) -> mayorista paga el MENOR = 9000.
  ('PROMO-M', 'Promo M', 'Samsung', 'Módulo', 'OLED', 20000, 9000, 12000,
   true, 5, true);
