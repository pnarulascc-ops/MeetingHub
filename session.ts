type AccessType = 'department' | 'jmd' | 'cmd'
type ExecutiveRole = 'jmd' | 'cmd'
type AccessMatch =
  | {
      accessType: 'department'
      departmentName: string
      displayName: string
    }
  | {
      accessType: ExecutiveRole
      departmentName: null
      displayName: string
    }

const SESSION_TTL_DAYS = 30

const DEPARTMENT_ACCESS = [
  { departmentName: 'Accounts', accessCode: 'Account1' },
  { departmentName: 'Audit', accessCode: 'Audit2' },
  { departmentName: 'Billing', accessCode: 'Billing3' },
  { departmentName: 'Contracts', accessCode: 'Contracts4' },
  { departmentName: 'Design', accessCode: 'Design5' },
  { departmentName: 'Document Controller', accessCode: 'DC6' },
  { departmentName: 'HR & Admin', accessCode: 'HR7' },
  { departmentName: 'IT', accessCode: 'IT8' },
  { departmentName: 'MEP', accessCode: 'MEP9' },
  { departmentName: 'P&M', accessCode: 'P&M10' },
  { departmentName: 'PMG', accessCode: 'PMG11' },
  { departmentName: 'Planning', accessCode: 'Plan12' },
  { departmentName: 'Projects', accessCode: 'Project13' },
  { departmentName: 'Purchase', accessCode: 'Purchase14' },
  { departmentName: 'Store', accessCode: 'Store15' },
  { departmentName: 'Techniexe', accessCode: 'Techniexe16' },
  { departmentName: 'Tender', accessCode: 'Tender17' },
  { departmentName: 'VP', accessCode: 'VP18' },
] as const

const EXECUTIVE_ACCESS = [
  { accessType: 'jmd', accessCode: 'Ok', displayName: 'JMD' },
  { accessType: 'cmd', accessCode: 'Scc', displayName: 'CMD' },
] as const

type SessionRow = {
  access_type: AccessType
  department_name: string | null
  display_name: string
  expires_at: string
}

export type SessionRecord = {
  accessType: AccessType
  departmentName: string | null
  displayName: string
  sessionToken: string
  expiresAt: string
}

export type AccessContext = Omit<SessionRecord, 'sessionToken'>

function isAccessType(value: string): value is AccessType {
  return value === 'department' || value === 'jmd' || value === 'cmd'
}

function matchAccessCode(rawCode: string): AccessMatch | null {
  const accessCode = rawCode.trim()
  if (!accessCode) {
    return null
  }

  const department = DEPARTMENT_ACCESS.find((entry) => entry.accessCode === accessCode)
  if (department) {
    return {
      accessType: 'department',
      departmentName: department.departmentName,
      displayName: department.departmentName,
    }
  }

  const executive = EXECUTIVE_ACCESS.find((entry) => entry.accessCode === accessCode)
  if (!executive) {
    return null
  }

  return {
    accessType: executive.accessType,
    departmentName: null,
    displayName: executive.displayName,
  }
}

async function hashToken(token: string): Promise<string> {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.subtle) {
    throw new Error('Secure token hashing is unavailable.')
  }

  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getExpiryTimestamp(): string {
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + SESSION_TTL_DAYS)
  return expiry.toISOString()
}

function createSessionToken(): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.randomUUID) {
    throw new Error('Secure session generation is unavailable.')
  }

  return cryptoApi.randomUUID()
}

export async function ensureMeetingTables(): Promise<void> {
  await retoolDb.query(`
    CREATE TABLE IF NOT EXISTS meeting_sessions (
      id BIGSERIAL PRIMARY KEY,
      session_token_hash TEXT NOT NULL UNIQUE,
      access_type TEXT NOT NULL,
      department_name TEXT NULL,
      display_name TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await retoolDb.query(`
    ALTER TABLE meeting_sessions
    ADD COLUMN IF NOT EXISTS department_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `)

  await retoolDb.query(`
    CREATE TABLE IF NOT EXISTS meeting_slots (
      id BIGSERIAL PRIMARY KEY,
      meeting_date DATE NOT NULL,
      slot_id TEXT NOT NULL,
      executive_role TEXT NOT NULL,
      status TEXT NOT NULL,
      department_name TEXT NULL,
      booked_by_name TEXT NULL,
      meeting_purpose TEXT NULL,
      note TEXT NULL,
      created_by_role TEXT NOT NULL,
      created_by_display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ NULL,
      cancelled_by_role TEXT NULL,
      cancelled_by_display_name TEXT NULL,
      UNIQUE (meeting_date, slot_id, executive_role)
    )
  `)

  await retoolDb.query(`
    ALTER TABLE meeting_slots
    ADD COLUMN IF NOT EXISTS department_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS booked_by_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS meeting_purpose TEXT NULL,
    ADD COLUMN IF NOT EXISTS note TEXT NULL,
    ADD COLUMN IF NOT EXISTS created_by_role TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS created_by_display_name TEXT NOT NULL DEFAULT 'System',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by_role TEXT NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by_display_name TEXT NULL
  `)

  await retoolDb.query(`
    CREATE TABLE IF NOT EXISTS meeting_requests (
      id BIGSERIAL PRIMARY KEY,
      meeting_date DATE NOT NULL,
      slot_id TEXT NOT NULL,
      executive_role TEXT NOT NULL,
      status TEXT NOT NULL,
      department_name TEXT NOT NULL,
      booked_by_name TEXT NOT NULL,
      meeting_purpose TEXT NOT NULL,
      remarks TEXT NULL,
      is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
      replaces_slot_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ NULL,
      reviewed_by_role TEXT NULL,
      reviewed_by_display_name TEXT NULL
    )
  `)

  await retoolDb.query(`
    ALTER TABLE meeting_requests
    ADD COLUMN IF NOT EXISTS meeting_purpose TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS remarks TEXT NULL,
    ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS replaces_slot_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS reviewed_by_role TEXT NULL,
    ADD COLUMN IF NOT EXISTS reviewed_by_display_name TEXT NULL
  `)
}

export async function createSessionFromAccessCode(accessCode: string, loginAs?: string): Promise<SessionRecord | null> {
  if (loginAs && !isAccessType(loginAs)) {
    throw new Error('Invalid login role.')
  }

  const match = matchAccessCode(accessCode)
  if (!match) {
    return null
  }

  if (loginAs && match.accessType !== loginAs) {
    return null
  }

  await ensureMeetingTables()

  const sessionToken = createSessionToken()
  const expiresAt = getExpiryTimestamp()

  await retoolDb.query(
    `
      INSERT INTO meeting_sessions (
        session_token_hash,
        access_type,
        department_name,
        display_name,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [await hashToken(sessionToken), match.accessType, match.departmentName, match.displayName, expiresAt]
  )

  return {
    accessType: match.accessType,
    departmentName: match.departmentName,
    displayName: match.displayName,
    sessionToken,
    expiresAt,
  }
}

export async function getSessionFromToken(sessionToken: string): Promise<AccessContext | null> {
  if (!sessionToken.trim()) {
    return null
  }

  await ensureMeetingTables()

  await retoolDb.query(
    `
      DELETE FROM meeting_sessions
      WHERE expires_at <= NOW()
    `
  )

  const result = await retoolDb.query<SessionRow>(
    `
      SELECT access_type, department_name, display_name, expires_at
      FROM meeting_sessions
      WHERE session_token_hash = $1
      LIMIT 1
    `,
    [await hashToken(sessionToken)]
  )

  const row = result.data[0]
  if (!row) {
    return null
  }

  return {
    accessType: row.access_type,
    departmentName: row.department_name,
    displayName: row.display_name,
    expiresAt: row.expires_at,
  }
}

export async function deleteSession(sessionToken: string): Promise<void> {
  if (!sessionToken.trim()) {
    return
  }

  await ensureMeetingTables()

  await retoolDb.query(
    `
      DELETE FROM meeting_sessions
      WHERE session_token_hash = $1
    `,
    [await hashToken(sessionToken)]
  )
}

export function requireExecutive(context: AccessContext): ExecutiveRole {
  if (context.accessType === 'jmd' || context.accessType === 'cmd') {
    return context.accessType
  }

  throw new Error('Management access required')
}

export function requireDepartment(context: AccessContext): { departmentName: string; displayName: string } {
  if (context.accessType === 'department' && context.departmentName) {
    return {
      departmentName: context.departmentName,
      displayName: context.displayName,
    }
  }

  throw new Error('Department access required')
}

export function toAccessContext(match: AccessMatch, expiresAt: string): AccessContext {
  return {
    accessType: match.accessType,
    departmentName: match.departmentName,
    displayName: match.displayName,
    expiresAt,
  }
}

export default {
  ensureMeetingTables,
  createSessionFromAccessCode,
  getSessionFromToken,
  deleteSession,
  requireExecutive,
  requireDepartment,
  toAccessContext,
}
