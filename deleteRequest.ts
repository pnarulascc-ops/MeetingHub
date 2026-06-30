import { ensureMeetingTables, getSessionFromToken, requireDepartment } from './session.ts'

type Params = {
  sessionToken: string
  requestId: number
}

type RequestRow = {
  id: number
  department_name: string
  status: 'pending_approval' | 'approved' | 'rejected'
}

export default async function deleteRequest(req: { params: Params; user: User }) {
  const session = await getSessionFromToken(req.params.sessionToken)
  if (!session) {
    throw new Error('Session expired. Please log in again.')
  }

  const department = requireDepartment(session)

  await ensureMeetingTables()

  const requestResult = await retoolDb.query<RequestRow>(
    `
      SELECT id, department_name, status
      FROM meeting_requests
      WHERE id = $1
      LIMIT 1
    `,
    [req.params.requestId]
  )

  const request = requestResult.data[0]
  if (!request || request.department_name !== department.departmentName) {
    throw new Error('Request not found.')
  }

  if (request.status !== 'pending_approval') {
    throw new Error('Only pending requests can be cancelled.')
  }

  await retoolDb.query(
    `
      DELETE FROM meeting_requests
      WHERE id = $1
    `,
    [req.params.requestId]
  )

  return { success: true }
}
