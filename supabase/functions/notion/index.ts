// Lexicove <-> Notion: OAuth connection, linking tables and two-way sync.
//
// Every request must carry the caller's Supabase session. Notion tokens are read from Vault
// here and never leave this function. All database access is scoped to the caller's user id.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  guessKind,
  pageToRow,
  propertyTypesOf,
  rowToProperties,
  suggestMapping,
  titleOf,
  validateMapping,
  type Kind,
  type Mapping,
  type NotionPage,
  type PropertyTypes,
} from './mapping.ts'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2025-09-03'

const ALLOWED_ORIGINS = [
  'https://lexicove.vercel.app',
  'http://localhost:5173',
  'http://tauri.localhost',
  'tauri://localhost',
]
// Must match the redirect URIs registered on the Notion integration.
const REDIRECT_URIS = ['https://lexicove.vercel.app/notion/callback', 'http://localhost:5173/notion/callback']

const STATE_TTL_MS = 10 * 60 * 1000
const SYNC_COOLDOWN_MS = 15 * 1000
const MAX_SOURCES = 10
const MAX_BODY_BYTES = 64 * 1024

const CLIENT_ID = Deno.env.get('NOTION_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('NOTION_CLIENT_SECRET') ?? ''

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

type Source = {
  id: string
  kind: Kind
  data_source_id: string
  mapping: Mapping
  property_types: PropertyTypes
  last_synced_at: string | null
}

// ---------- HTTP entry point ----------

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
    const userId = await authenticate(req)
    const body = await readBody(req)
    const result = await dispatch(userId, body)
    return new Response(JSON.stringify(result), { status: 200, headers })
  } catch (error) {
    if (!(error instanceof HttpError)) console.error(error)
    const status = error instanceof HttpError ? error.status : 500
    const code = error instanceof HttpError ? error.code : 'internal_error'
    const message = error instanceof HttpError ? error.message : 'Something went wrong on the server'
    return new Response(JSON.stringify({ error: code, message }), { status, headers })
  }
})

async function authenticate(req: Request): Promise<string> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'unauthorized', 'Sign in first')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'unauthorized', 'Sign in first')
  if (data.user.is_anonymous) throw new HttpError(403, 'account_required', 'Create an account to connect Notion')
  return data.user.id
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large')
  try {
    const body = JSON.parse(text || '{}')
    if (body && typeof body === 'object' && !Array.isArray(body)) return body
  } catch {
    // fall through
  }
  throw new HttpError(400, 'bad_request', 'Expected a JSON object')
}

function dispatch(userId: string, body: Record<string, unknown>) {
  switch (body.action) {
    case 'status':
      return status(userId)
    case 'start':
      return start(userId, body.redirect_uri)
    case 'finish':
      return finish(userId, body.code, body.state)
    case 'disconnect':
      return disconnect(userId)
    case 'list_sources':
      return listSources(userId)
    case 'add_source':
      return addSource(userId, body)
    case 'sync':
      return sync(userId, body.source_id)
    default:
      throw new HttpError(400, 'unknown_action')
  }
}

// ---------- Connection ----------

function requireConfigured() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new HttpError(503, 'not_configured', 'The Notion integration is not set up on the server yet')
  }
}

async function status(userId: string) {
  const { data, error } = await admin
    .from('notion_connections')
    .select('workspace_name, workspace_icon, created_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return { configured: Boolean(CLIENT_ID && CLIENT_SECRET), connected: Boolean(data), workspace: data }
}

async function start(userId: string, redirectUri: unknown) {
  requireConfigured()
  if (typeof redirectUri !== 'string' || !REDIRECT_URIS.includes(redirectUri)) {
    throw new HttpError(400, 'bad_redirect_uri')
  }

  const state = randomToken()
  await admin.from('notion_oauth_states').delete().eq('user_id', userId)
  const { error } = await admin.from('notion_oauth_states').insert({ state, user_id: userId, redirect_uri: redirectUri })
  if (error) throw error

  const url = new URL(`${NOTION_API}/oauth/authorize`)
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    owner: 'user',
    redirect_uri: redirectUri,
    state,
  }).toString()
  return { url: url.toString() }
}

async function finish(userId: string, code: unknown, state: unknown) {
  requireConfigured()
  if (typeof code !== 'string' || typeof state !== 'string' || code.length > 1000 || state.length > 128) {
    throw new HttpError(400, 'bad_request')
  }

  const { data: saved } = await admin
    .from('notion_oauth_states')
    .select('user_id, redirect_uri, created_at')
    .eq('state', state)
    .maybeSingle()
  // Single use, whatever happens next.
  await admin.from('notion_oauth_states').delete().eq('state', state)

  const expired = !saved || Date.now() - Date.parse(saved.created_at) > STATE_TTL_MS
  if (expired || saved.user_id !== userId) {
    throw new HttpError(400, 'bad_state', 'This Notion link has expired. Please connect again.')
  }

  const token = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: saved.redirect_uri })
  await saveConnection(userId, token, token.refresh_token ?? null)
  return { workspace_name: token.workspace_name ?? null }
}

async function disconnect(userId: string) {
  const { error } = await admin.rpc('notion_delete_connection', { p_user: userId })
  if (error) throw error
  return { ok: true }
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  bot_id: string
  workspace_id: string
  workspace_name?: string | null
  workspace_icon?: string | null
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${NOTION_API}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || typeof json.access_token !== 'string') {
    throw new HttpError(502, 'notion_oauth_failed', json.error_description ?? json.message ?? 'Notion refused the request')
  }
  return json as TokenResponse
}

async function saveConnection(userId: string, token: TokenResponse, refreshToken: string | null) {
  const { error } = await admin.rpc('notion_save_connection', {
    p_user: userId,
    p_access_token: token.access_token,
    p_refresh_token: refreshToken,
    p_workspace_id: token.workspace_id,
    p_workspace_name: token.workspace_name ?? null,
    p_workspace_icon: token.workspace_icon ?? null,
    p_bot_id: token.bot_id,
  })
  if (error) throw error
}

// ---------- Notion API client ----------

type Notion = (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => Promise<Record<string, any>>

async function notionFor(userId: string): Promise<Notion> {
  const { data, error } = await admin.rpc('notion_read_tokens', { p_user: userId })
  if (error) throw error
  const tokens = (Array.isArray(data) ? data[0] : data) as { access_token?: string; refresh_token?: string } | null
  if (!tokens?.access_token) throw new HttpError(409, 'not_connected', 'Connect Notion first')

  let access = tokens.access_token
  let refresh = tokens.refresh_token ?? null
  let refreshed = false

  return async function call(method, path, body) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${NOTION_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${access}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })

      // Notion allows about three requests per second; wait as told and try again.
      if (res.status === 429) {
        const seconds = Math.min(10, Number(res.headers.get('retry-after')) || 1)
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
        continue
      }

      if (res.status === 401 && refresh && !refreshed) {
        refreshed = true
        let token: TokenResponse
        try {
          token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })
        } catch {
          throw new HttpError(409, 'reconnect_required', 'Notion access has expired. Please connect again.')
        }
        access = token.access_token
        refresh = token.refresh_token ?? refresh
        await persistRefreshedToken(userId, token, refresh)
        continue
      }

      const json = await res.json().catch(() => ({}))
      if (res.status === 401) throw new HttpError(409, 'reconnect_required', 'Notion access has expired. Please connect again.')
      if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, 'notion_error', json.message ?? `Notion returned ${res.status}`)
      return json
    }
    throw new HttpError(503, 'notion_busy', 'Notion is busy right now. Try again in a minute.')
  }
}

async function persistRefreshedToken(userId: string, token: TokenResponse, refresh: string | null) {
  // Refresh responses may omit workspace details, so keep the stored ones.
  const { data } = await admin
    .from('notion_connections')
    .select('workspace_id, workspace_name, workspace_icon, bot_id')
    .eq('user_id', userId)
    .single()
  await saveConnection(
    userId,
    {
      ...token,
      workspace_id: token.workspace_id ?? data?.workspace_id,
      workspace_name: token.workspace_name ?? data?.workspace_name,
      workspace_icon: token.workspace_icon ?? data?.workspace_icon,
      bot_id: token.bot_id ?? data?.bot_id,
    },
    refresh,
  )
}

// ---------- Linking tables ----------

async function listSources(userId: string) {
  const notion = await notionFor(userId)
  const sources = []
  let cursor: string | undefined

  do {
    const res = await notion('POST', '/search', {
      filter: { property: 'object', value: 'data_source' },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    for (const item of res.results ?? []) {
      if (item.object !== 'data_source') continue
      let types = propertyTypesOf(item.properties)
      // Search results may come without the schema; fetch it when that happens.
      if (Object.keys(types).length === 0 && sources.length < 50) {
        types = propertyTypesOf((await notion('GET', `/data_sources/${item.id}`)).properties)
      }
      const title = titleOf(item)
      sources.push({
        id: item.id as string,
        title,
        kind: guessKind(title, types),
        properties: Object.entries(types).map(([name, type]) => ({ name, type })),
        suggested: { words: suggestMapping('words', types), rules: suggestMapping('rules', types) },
      })
    }
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor && sources.length < 300)

  return { sources }
}

async function addSource(userId: string, body: Record<string, unknown>) {
  const kind = body.kind
  if (kind !== 'words' && kind !== 'rules') throw new HttpError(400, 'bad_request', 'kind must be "words" or "rules"')
  const dataSourceId = body.data_source_id
  if (typeof dataSourceId !== 'string' || !/^[0-9a-f-]{32,36}$/i.test(dataSourceId)) {
    throw new HttpError(400, 'bad_request', 'data_source_id is not a Notion id')
  }

  const { count } = await admin.from('notion_sources').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if ((count ?? 0) >= MAX_SOURCES) throw new HttpError(400, 'too_many_sources', `Up to ${MAX_SOURCES} tables can be linked`)

  const notion = await notionFor(userId)
  const dataSource = await notion('GET', `/data_sources/${dataSourceId}`)
  const types = propertyTypesOf(dataSource.properties)
  const mapping = body.mapping ?? suggestMapping(kind, types)
  const problem = validateMapping(kind, mapping, types)
  if (problem) throw new HttpError(400, 'bad_mapping', problem)

  const cleanMapping = Object.fromEntries(
    Object.entries(mapping as Record<string, unknown>).filter(([, property]) => typeof property === 'string' && property),
  )

  const { data: source, error } = await admin
    .from('notion_sources')
    .upsert(
      {
        user_id: userId,
        kind,
        data_source_id: (dataSource.id as string) ?? dataSourceId,
        title: titleOf(dataSource).slice(0, 200),
        mapping: cleanMapping,
        property_types: types,
        last_error: null,
      },
      { onConflict: 'user_id,data_source_id' },
    )
    .select('id, kind, data_source_id, mapping, property_types, last_synced_at')
    .single()
  if (error) throw error

  const summary = await syncSource(notion, userId, source as Source)
  return { source_id: source.id, ...summary }
}

// ---------- Sync ----------

async function sync(userId: string, sourceId: unknown) {
  let query = admin
    .from('notion_sources')
    .select('id, kind, data_source_id, mapping, property_types, last_synced_at')
    .eq('user_id', userId)
  if (typeof sourceId === 'string') query = query.eq('id', sourceId)
  const { data: sources, error } = await query
  if (error) throw error
  if (!sources?.length) throw new HttpError(404, 'no_sources', 'Link a Notion table first')

  const tooSoon = sources.some(
    (source) => source.last_synced_at && Date.now() - Date.parse(source.last_synced_at) < SYNC_COOLDOWN_MS,
  )
  if (tooSoon) throw new HttpError(429, 'too_soon', 'Synced a moment ago. Try again in a few seconds.')

  const notion = await notionFor(userId)
  const results = []
  for (const source of sources as Source[]) {
    try {
      results.push({ source_id: source.id, ...(await syncSource(notion, userId, source)) })
    } catch (error) {
      if (error instanceof HttpError && error.code === 'reconnect_required') throw error
      const message = error instanceof Error ? error.message : 'Sync failed'
      await admin.from('notion_sources').update({ last_error: message.slice(0, 500) }).eq('id', source.id)
      results.push({ source_id: source.id, error: message })
    }
  }
  return { results }
}

/** Push local edits to Notion, then pull the whole table back. */
async function syncSource(notion: Notion, userId: string, source: Source) {
  const table = source.kind
  const pushed = await pushPending(notion, userId, source)

  const pages: NotionPage[] = []
  let cursor: string | undefined
  do {
    const res = await notion('POST', `/data_sources/${source.data_source_id}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    pages.push(...((res.results ?? []) as NotionPage[]))
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor && pages.length < 20000)

  const { data: existing, error } = await admin
    .from(table)
    .select('id, source_id, notion_page_id, needs_push')
    .eq('user_id', userId)
    .not('notion_page_id', 'is', null)
  if (error) throw error

  // Rows with unsent local edits keep their local version this round.
  const pendingIds = new Set(existing.filter((row) => row.needs_push).map((row) => row.notion_page_id))
  const keptIds = new Set<string>(pendingIds)
  const rows = []

  for (const page of pages) {
    if (page.object && page.object !== 'page') continue
    if (pendingIds.has(page.id)) continue
    const row = pageToRow(source.kind, page, source.mapping)
    if (!row) continue
    keptIds.add(page.id)
    rows.push({
      ...row,
      user_id: userId,
      source_id: source.id,
      notion_page_id: page.id,
      notion_edited_at: page.last_edited_time ?? null,
      needs_push: false,
      deleted_at: null,
    })
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error: upsertError } = await admin
      .from(table)
      .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,notion_page_id' })
    if (upsertError) throw upsertError
  }

  // Pages deleted (or emptied) in Notion disappear here too.
  const goneIds = existing
    .filter((row) => row.source_id === source.id && !row.needs_push && !keptIds.has(row.notion_page_id))
    .map((row) => row.id)
  for (let i = 0; i < goneIds.length; i += 200) {
    const { error: deleteError } = await admin.from(table).delete().in('id', goneIds.slice(i, i + 200))
    if (deleteError) throw deleteError
  }

  await admin
    .from('notion_sources')
    .update({ last_synced_at: new Date().toISOString(), last_error: null })
    .eq('id', source.id)

  return { pulled: rows.length, removed: goneIds.length, pushed }
}

async function pushPending(notion: Notion, userId: string, source: Source) {
  const table = source.kind
  const { data: pending, error } = await admin
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .eq('source_id', source.id)
    .eq('needs_push', true)
    .limit(200)
  if (error) throw error

  const counts = { created: 0, updated: 0, removed: 0 }

  for (const row of pending) {
    if (row.deleted_at) {
      if (row.notion_page_id) {
        try {
          await notion('PATCH', `/pages/${row.notion_page_id}`, { in_trash: true })
        } catch (err) {
          if (!(err instanceof HttpError && err.status === 404)) throw err
        }
      }
      await admin.from(table).delete().eq('id', row.id)
      counts.removed++
      continue
    }

    const properties = rowToProperties(source.kind, row, source.mapping, source.property_types)
    let page: Record<string, any> | null = null

    if (row.notion_page_id) {
      try {
        page = await notion('PATCH', `/pages/${row.notion_page_id}`, { properties })
        counts.updated++
      } catch (err) {
        // The page was deleted in Notion: recreate it rather than lose the edit.
        if (!(err instanceof HttpError && err.status === 404)) throw err
      }
    }
    if (!page) {
      page = await notion('POST', '/pages', {
        parent: { type: 'data_source_id', data_source_id: source.data_source_id },
        properties,
      })
      counts.created++
    }

    const { error: updateError } = await admin
      .from(table)
      .update({ needs_push: false, notion_page_id: page.id, notion_edited_at: page.last_edited_time ?? null })
      .eq('id', row.id)
    if (updateError) throw updateError
  }

  return counts
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
