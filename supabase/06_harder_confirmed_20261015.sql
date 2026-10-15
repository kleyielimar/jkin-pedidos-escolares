-- HARDER: datos confirmados por Norma el 15 de octubre de 2026.
-- Ejecutar completo en SQL Editor. NO vuelve a crear tablas ni pedidos.
-- No elimina clases. Conserva IDs de clases reconocidas. Se detiene si hay clases ambiguas
-- con pedidos/entregas o si existe mas de un intervalo de Harder.
-- No cambia precios ni habilita prendas de staff sin tallas confirmadas.
begin;
create temp table harder_classes_20261015 (
  teacher text primary key, grade text not null, sort int unique,
  aliases text[] not null
) on commit drop;
insert into harder_classes_20261015 values
('Anciso','KN',1,array['anciso','nataliaanciso']),
('Bessolo','KN',2,array['bessolo','ninabessolo']),
('Gonzales, S','KN',3,array['gonzaless','stephaniegonzales','gonzalesstephanie']),
('Carranza','KN',4,array['carranza','jennifercarranza']),
('Padania','TK',5,array['padania','hongpadania']),
('Ureno','TK',6,array['ureno','guadalupeureno']),
('Araujo','1',7,array['araujo','kristinaaraujo']),
('Bautista','1',8,array['bautista','laurabautista']),
('Cienega','1',9,array['cienega','anacienega']),
('Vargas, V','1',10,array['vargas','vargasv','vanessavargas']),
('Arrillaga','2',11,array['arrillaga','arillaga','katyarrillaga']),
('Singco-Vargas','2',12,array['singcovargas','singiovargas','mariasingcovargas']),
('De Leon','2',13,array['deleon','neurinadeleon']),
('Cavallaro','2',14,array['cavallaro','avacavallaro']),
('Magana','3',15,array['magana','maganachavez','anahimaganachavez']),
('Barba','3',16,array['barba','sunandabarba']),
('Prieto','3',17,array['prieto','luzprieto']),
('Rutter','3',18,array['rutter','janeenrutter']),
('Blakely','4',19,array['blakely','monicablakely']),
('Cordero','4',20,array['cordero','andreacordero']),
('Richardson','4',21,array['richardson','samantharichardson']),
('Zaragonza','4',22,array['zaragonza','zaragoza','zaragozavillanueva','dianazaragozavillanueva']),
('Gonzales, M','5',23,array['gonzalesm','michaelgonzales','gonzalesmichael']),
('Ramirez','5',24,array['ramirez','nataliaramirez']),
('Wadia','5',25,array['wadia','delcinawadia']),
('Dilworth','6',26,array['dilworth','crystaldilworth']),
('Herrick','6',27,array['herrick','victoriaherrick']),
('Klopstock','6',28,array['klopstock','samuelklopstock']);

create function pg_temp.harder_name_key(t text) returns text
language sql immutable as $$
  select regexp_replace(
    regexp_replace(lower(trim(t)), '^(ms|mrs|mr)[.]?[[:space:]]+', ''),
    '[^a-z0-9]', '', 'g');
$$;

do $$
declare
  target uuid; n int; c record; found_id uuid; conflict_names text;
begin
  select count(*), (array_agg(p.id))[1] into n,target
  from public.periods p join public.schools s on s.id=p.school_id
  where lower(s.name) like '%harder%';
  if n<>1 then
    raise exception 'No se aplico ningun cambio: se esperaba 1 intervalo de Harder y se encontraron %. Hay que seleccionar el intervalo correcto.',n;
  end if;
  perform 1 from public.periods where id=target for update;
  perform 1 from public.groups where period_id=target for update;

  -- No borrar ni reasignar pedidos de clases que no se pueden identificar.
  select string_agg(g.teacher, ', ' order by g.teacher) into conflict_names
  from public.groups g
  where g.period_id=target
    and pg_temp.harder_name_key(g.teacher)<>'staff'
    and not exists (select 1 from harder_classes_20261015 c
      where pg_temp.harder_name_key(g.teacher)=any(c.aliases))
    and (exists (select 1 from public.order_lines l where l.group_id=g.id)
      or exists (select 1 from public.deliveries d where d.group_id=g.id));
  if conflict_names is not null then
    raise exception 'No se aplico ningun cambio. Estas clases antiguas tienen pedidos o entregas y requieren revision: %',conflict_names;
  end if;

  for c in select * from harder_classes_20261015 order by sort loop
    select count(*), (array_agg(g.id))[1] into n,found_id
    from public.groups g where g.period_id=target
      and pg_temp.harder_name_key(g.teacher)=any(c.aliases);
    if n>1 then
      raise exception 'No se aplico ningun cambio. Hay clases duplicadas para %; revisar antes de continuar.',c.teacher;
    elsif n=1 then
      update public.groups set teacher=c.teacher,grade=c.grade,sort=c.sort
      where id=found_id;
    else
      insert into public.groups(period_id,teacher,grade,sort)
      values(target,c.teacher,c.grade,c.sort);
    end if;
  end loop;

  -- Conserva todas las clases antiguas; su revision se hace desde el panel.

  insert into public.period_date_log(period_id,by_email,detail)
  select target,'actualizacion-confirmada-20261015',
    open_date::text || ' - ' || close_date::text || ' -> 2026-10-22 - 2026-11-06'
  from public.periods where id=target
    and (open_date<>date '2026-10-22' or close_date<>date '2026-11-06');
  -- Estado abierto: el servidor respeta la fecha de inicio y cierre.
  update public.periods set open_date=date '2026-10-22',
    close_date=date '2026-11-06',status='open' where id=target;

  -- Youth XS confirmado. Solo prendas escolares con tallaje infantil existente.
  update public.products set sizes=jsonb_set(sizes,'{child}',
    '["XS"]'::jsonb || coalesce(sizes->'child','[]'::jsonb))
  where period_id=target and category='school'
    and jsonb_typeof(sizes->'child')='array'
    and jsonb_array_length(sizes->'child')>0
    and not ((sizes->'child') ? 'XS');

  select count(*) into n from public.groups g where g.period_id=target
    and exists(select 1 from harder_classes_20261015 c where c.teacher=g.teacher);
  if n<>28 then raise exception 'Verificacion fallida: se esperaban 28 clases.'; end if;
end $$;

-- Comprobacion final: clases confirmadas y entradas antiguas que revisar.
select g.teacher,g.grade,g.room,p.open_date,p.close_date,
  case when exists(select 1 from harder_classes_20261015 c where c.teacher=g.teacher)
    then 'CONFIRMADA' when pg_temp.harder_name_key(g.teacher)='staff'
    then 'STAFF' else 'REVISAR EN PANEL' end as revision
from public.groups g join public.periods p on p.id=g.period_id
join public.schools s on s.id=p.school_id
where lower(s.name) like '%harder%' order by g.sort,g.teacher;
commit;
