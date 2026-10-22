-- Accesso: execute no SQL Editor de um projeto Supabase.
-- Estrutura destinada ao servidor Node.js com chave secreta no backend.
-- Integração via RPC do servidor Node.js. Execute este arquivo completo.
begin;

-- JSON preserva o formato usado pelo FaceAPI: cinco vetores de 128 números.
create or replace function public.accesso_valid_descriptors(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  sample jsonb;
  component jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) <> 5 then return false; end if;
  for sample in select jsonb_array_elements(value) loop
    if jsonb_typeof(sample) <> 'array' then return false; end if;
    if jsonb_array_length(sample) <> 128 then return false; end if;
    for component in select jsonb_array_elements(sample) loop
      if jsonb_typeof(component) <> 'number' then return false; end if;
      -- Mantém números representáveis como Number finito no JavaScript.
      if abs(component::text::numeric) > 1.7976931348623157e308::numeric then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

create table if not exists public.people (
  id text primary key check (char_length(id) between 1 and 50 and btrim(id) <> ''),
  name text not null check (char_length(name) between 1 and 100 and btrim(name) <> ''),
  authorized boolean not null default false,
  descriptors jsonb not null check (public.accesso_valid_descriptors(descriptors)),
  model text not null default 'face-api-1.7.15/faceRecognitionNet'
    check (model = 'face-api-1.7.15/faceRecognitionNet'),
  "createdAt" timestamptz not null default now()
);

-- IDs como ABC e abc não podem pertencer a pessoas diferentes.
create unique index if not exists accesso_people_id_lower_idx
  on public.people (lower(id));

-- Snapshot do ID/nome: remover uma pessoa preserva seu histórico.
-- Sem FK deliberadamente, acompanhando o comportamento de LocalRepository.
create table if not exists public.access_history (
  id uuid primary key default gen_random_uuid(),
  "personId" text,
  name text not null default 'Pessoa não identificada',
  timestamp timestamptz not null default now(),
  allowed boolean not null default false,
  constraint accesso_allowed_requires_person check (not allowed or "personId" is not null)
);
create index if not exists accesso_history_timestamp_idx
  on public.access_history (timestamp desc);
create index if not exists accesso_history_person_idx
  on public.access_history ("personId");

-- Configuração única para esta instalação do Accesso.
create table if not exists public.access_settings (
  id smallint primary key default 1 check (id = 1),
  threshold double precision not null default 0.45 check (threshold between 0.30 and 0.55),
  cooldown double precision not null default 20 check (cooldown between 5 and 300),
  landmarks boolean not null default false
);
insert into public.access_settings (id) values (1) on conflict (id) do nothing;

-- O projeto ainda não tem login administrativo. Nenhum acesso direto do navegador.
alter table public.people enable row level security;
alter table public.access_history enable row level security;
alter table public.access_settings enable row level security;
revoke all on table public.people, public.access_history, public.access_settings
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.people, public.access_history, public.access_settings to service_role;
revoke all on function public.accesso_valid_descriptors(jsonb) from public;
grant execute on function public.accesso_valid_descriptors(jsonb) to service_role;

-- Versão global serializa alterações de pessoas entre abas/servidores.
create table if not exists public.access_state (
 id smallint primary key check (id = 1),
 version bigint not null default 0 check (version >= 0)
);
insert into public.access_state(id) values (1) on conflict do nothing;
alter table public.access_state enable row level security;
revoke all on public.access_state from public, anon, authenticated;
grant select, update on public.access_state to service_role;

create or replace function public.accesso_load()
returns jsonb language sql volatile set search_path = pg_catalog, public as $$
 select jsonb_build_object(
 'version', s.version,
 'people', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from public.people p),
 'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.timestamp desc, h.id), '[]'::jsonb)
   from (select * from public.access_history order by timestamp desc, id limit 2000) h),
 'settings', (select to_jsonb(c) - 'id' from public.access_settings c where id=1),
 'backend', 'supabase') from public.access_state s where id=1;
$$;

-- Evita baixar descritores e histórico inteiros a cada leitura facial.
create or replace function public.accesso_recognition(known_version bigint)
returns jsonb language sql volatile set search_path = pg_catalog, public as $$
 select jsonb_build_object('version', s.version,
 'people', case when s.version <> known_version then
   (select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) from public.people p)
   else null end,
 'settings',(select to_jsonb(c)-'id' from public.access_settings c where id=1))
 from public.access_state s where id=1;
$$;

create or replace function public.accesso_save_people(expected_version bigint, new_people jsonb)
returns jsonb language plpgsql set search_path = pg_catalog, public as $$
declare current_version bigint;
begin
 select version into current_version from public.access_state where id=1 for update;
 if expected_version is null or current_version <> expected_version then
   raise sqlstate 'PT409' using message='O banco foi alterado em outra aba. Recarregue a página.';
 end if;
 if new_people is null or jsonb_typeof(new_people) <> 'array' then raise exception 'Lista inválida'; end if;
 if jsonb_array_length(new_people) > 1000 then raise exception 'Limite de 1000 pessoas'; end if;
 delete from public.people;
 insert into public.people(id,name,authorized,descriptors,model,"createdAt")
 select p.id,p.name,p.authorized,p.descriptors,
 coalesce(p.model,'face-api-1.7.15/faceRecognitionNet'),coalesce(p."createdAt",now())
 from jsonb_to_recordset(new_people) as p(id text,name text,authorized boolean,descriptors jsonb,model text,"createdAt" timestamptz);
 update public.access_state set version=version+1 where id=1;
 return public.accesso_load();
end;
$$;

create or replace function public.accesso_log(entry_id uuid, person_id text)
returns jsonb language plpgsql set search_path = pg_catalog, public as $$
declare person public.people; entry public.access_history;
begin
 -- Serializa logs para aplicar a retenção mesmo sob concorrência.
 perform 1 from public.access_state where id=1 for update;
 select * into entry from public.access_history where id=entry_id;
 if found then return to_jsonb(entry); end if;
 select * into person from public.people where id=person_id;
 insert into public.access_history(id,"personId",name,allowed)
 values(entry_id,person.id,coalesce(person.name,'Pessoa não identificada'),coalesce(person.authorized,false))
 returning * into entry;
 delete from public.access_history where id in
 (select id from public.access_history order by timestamp desc,id offset 2000);
 return to_jsonb(entry);
end;
$$;

create or replace function public.accesso_configure(new_settings jsonb)
returns jsonb language plpgsql set search_path = pg_catalog, public as $$
declare result jsonb;
begin
 update public.access_settings set threshold=(new_settings->>'threshold')::double precision,
 cooldown=(new_settings->>'cooldown')::double precision,landmarks=(new_settings->>'landmarks')::boolean where id=1;
 select to_jsonb(s)-'id' into result from public.access_settings s where id=1;
 return result;
end;
$$;
revoke all on function public.accesso_recognition(bigint) from public, anon, authenticated;
grant execute on function public.accesso_recognition(bigint) to service_role;
revoke all on function public.accesso_load(), public.accesso_save_people(bigint,jsonb),
 public.accesso_log(uuid,text), public.accesso_configure(jsonb) from public, anon, authenticated;
grant execute on function public.accesso_load(), public.accesso_save_people(bigint,jsonb),
 public.accesso_log(uuid,text), public.accesso_configure(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
