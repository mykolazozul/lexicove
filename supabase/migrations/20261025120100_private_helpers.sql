-- Helpers used by RLS policies live in a schema that the REST API doesn't expose,
-- so they can't be called directly as /rest/v1/rpc endpoints.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.has_min_role(public.app_role) set schema private;
