import { isExecutiveRole } from './config.ts'
import { ensureMeetingTables, getSessionFromToken, requireExecutive } from './session.ts'

type Params = {
  sessionToken: string
  requestId: number
  remarks?: string
}

type RequestRow = {
  id: number
  meeting_date: string
  slot_id: string
  executive_role: string
  status: string
  department_name: string
  booked_by_name: string
  meeting_purpose: string
  is_emergency: boolean
  replaces_slot_id: number | null
}

type ExistingSlotRow = {
  id: number
}

export default async function approveRequest(req: { params: Params; user: User }) {
  const session = await getSessionFromToken(req.params.sessionToken)
  if (!session) {
    throw new Error('Session expired. Please log in again.')
  }

  const executiveRole = requireExecutive(session)

  await ensureMeetingTables()

  const requestResult = await retoolDb.query<RequestRow>(
    `
      SELECT
        id,
        meeting_date,
        slot_id,
        executive_role,
        status,
        department_name,
        booked_by_name,
        meeting_purpose,
        is_emergency,
        replaces_slot_id
      FROM meeting_requests
      WHERE id = $1
      LIMIT 1
    `,
    [req.params.requestId]
  )

  const request = requestResult.data[0]
  if (!request) {
    throw new Error('Approval request not found.')
  }

  if (!isExecutiveRole(request.executive_role) || request.executive_role !== executiveRole) {
    throw new Error('You can only review requests for your own calendar.')
  }

  if (request.status !== 'pending_approval') {
    throw new Error('This request has already been reviewed.')
  }

  const existingSlotResult = await retoolDb.query<ExistingSlotRow>(
    `
      SELECT id
      FROM meeting_slots
      WHERE meeting_date = $1
        AND slot_id = $2
        AND executive_role = $3
      LIMIT 1
    `,
    [request.meeting_date, request.slot_id, request.executive_role]
  )

  const existingSlot = existingSlotResult.data[0]
  if (existingSlot) {
    await retoolDb.query(
      `
        DELETE FROM meeting_slots
        WHERE id = $1
      `,
      [existingSlot.id]
    )
  }

  await retoolDb.query(
    `
      INSERT INTO meeting_slots (
        meeting_date,
        slot_id,
        executive_role,
        status,
        department_name,
        booked_by_name,
        meeting_purpose,
        note,
        created_by_role,
        created_by_display_name
      )
      VALUES ($1, $2, $3, 'booked', $4, $5, $6, NULL, 'department', $7)
    `,
    [
      request.meeting_date,
      request.slot_id,
      request.executive_role,
      request.department_name,
      request.booked_by_name,
      request.meeting_purpose,
      request.department_name,
    ]
  )

  await retoolDb.query(
    `
      UPDATE meeting_requests
      SET status = 'approved',
          remarks = $1,
          reviewed_at = NOW(),
          reviewed_by_role = $2,
          reviewed_by_display_name = $3
      WHERE id = $4
    `,
    [req.params.remarks?.trim() || null, executiveRole, session.displayName, req.params.requestId]
  )

  return { success: true }
}
