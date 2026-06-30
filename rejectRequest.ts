import { isExecutiveRole } from './config.ts'
import { ensureMeetingTables, getSessionFromToken, requireExecutive } from './session.ts'

type Params = {
  sessionToken: string
  requestId: number
  remarks?: string
}

type RequestRow = {
  id: number
  executive_role: string
  status: string
}

export default async function rejectRequest(req: { params: Params; user: User }) {
  const session = await getSessionFromToken(req.params.sessionToken)
  if (!session) {
    throw new Error('Session expired. Please log in again.')
  }

  const executiveRole = requireExecutive(session)

  await ensureMeetingTables()

  const requestResult = await retoolDb.query<RequestRow>(
    `
      SELECT id, executive_role, status
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

  await retoolDb.query(
    `
      UPDATE meeting_requests
      SET status = 'rejected',
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
