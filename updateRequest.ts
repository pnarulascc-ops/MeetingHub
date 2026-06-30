import { isExecutiveRole, isValidMeetingDate, isValidSlotId } from './config.ts'
import { ensureMeetingTables, getSessionFromToken, requireDepartment } from './session.ts'

type Params = {
  sessionToken: string
  requestId: number
  meetingDate: string
  slotId: string
  executiveRole: string
  bookedByName: string
  meetingPurpose: string
  isEmergency?: boolean
}

type RequestRow = {
  id: number
  department_name: string
  status: 'pending_approval' | 'approved' | 'rejected'
}

type ExistingSlotRow = {
  id: number
}

type ExistingPendingRow = {
  id: number
}

export default async function updateRequest(req: { params: Params; user: User }) {
  const session = await getSessionFromToken(req.params.sessionToken)
  if (!session) {
    throw new Error('Session expired. Please log in again.')
  }

  const department = requireDepartment(session)

  if (!isValidMeetingDate(req.params.meetingDate)) {
    throw new Error('Invalid meeting date.')
  }

  if (!isValidSlotId(req.params.slotId)) {
    throw new Error('Invalid slot.')
  }

  if (!isExecutiveRole(req.params.executiveRole)) {
    throw new Error('Invalid dashboard.')
  }

  const bookedByName = req.params.bookedByName.trim()
  if (!bookedByName) {
    throw new Error('Your name is required.')
  }

  const meetingPurpose = req.params.meetingPurpose.trim()
  if (!meetingPurpose) {
    throw new Error('Purpose of meeting is required.')
  }

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
    throw new Error('Only pending requests can be edited.')
  }

  const existingSlotResult = await retoolDb.query<ExistingSlotRow>(
    `
      SELECT id
      FROM meeting_slots
      WHERE meeting_date = $1
        AND slot_id = $2
        AND executive_role = $3
        AND status != 'cancelled'
      LIMIT 1
    `,
    [req.params.meetingDate, req.params.slotId, req.params.executiveRole]
  )

  const existingPendingResult = await retoolDb.query<ExistingPendingRow>(
    `
      SELECT id
      FROM meeting_requests
      WHERE meeting_date = $1
        AND slot_id = $2
        AND executive_role = $3
        AND status = 'pending_approval'
        AND id != $4
      LIMIT 1
    `,
    [req.params.meetingDate, req.params.slotId, req.params.executiveRole, req.params.requestId]
  )

  const isEmergency = req.params.isEmergency === true
  if (!isEmergency && (existingSlotResult.data[0] || existingPendingResult.data[0])) {
    throw new Error('This slot is no longer available.')
  }

  await retoolDb.query(
    `
      UPDATE meeting_requests
      SET meeting_date = $1,
          slot_id = $2,
          executive_role = $3,
          booked_by_name = $4,
          meeting_purpose = $5,
          is_emergency = $6,
          replaces_slot_id = $7,
          remarks = NULL
      WHERE id = $8
    `,
    [
      req.params.meetingDate,
      req.params.slotId,
      req.params.executiveRole,
      bookedByName,
      meetingPurpose,
      isEmergency,
      existingSlotResult.data[0]?.id ?? null,
      req.params.requestId,
    ]
  )

  return { success: true }
}
