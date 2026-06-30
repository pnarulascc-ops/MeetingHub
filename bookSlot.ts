import { getExecutiveDisplayName, isExecutiveRole, isValidMeetingDate, isValidSlotId } from './config.ts'
import { ensureMeetingTables, getSessionFromToken } from './session.ts'

type Params = {
  sessionToken: string
  meetingDate: string
  slotId: string
  executiveRole: string
  bookedByName?: string
  meetingPurpose?: string
  isEmergency?: boolean
}

type ExistingRow = {
  id: number
  status: string
  department_name: string | null
  booked_by_name: string | null
}

type PendingRow = {
  id: number
}

export default async function bookSlot(req: { params: Params; user: User }) {
  const session = await getSessionFromToken(req.params.sessionToken)
  if (!session) {
    throw new Error('Session expired. Please log in again.')
  }

  if (!isValidMeetingDate(req.params.meetingDate)) {
    throw new Error('Invalid meeting date.')
  }

  if (!isValidSlotId(req.params.slotId)) {
    throw new Error('Invalid slot.')
  }

  if (!isExecutiveRole(req.params.executiveRole)) {
    throw new Error('Invalid executive role.')
  }

  await ensureMeetingTables()

  const existingResult = await retoolDb.query<ExistingRow>(
    `
      SELECT id, status, department_name, booked_by_name
      FROM meeting_slots
      WHERE meeting_date = $1
        AND slot_id = $2
        AND executive_role = $3
        AND status != 'cancelled'
      LIMIT 1
    `,
    [req.params.meetingDate, req.params.slotId, req.params.executiveRole]
  )

  const pendingResult = await retoolDb.query<PendingRow>(
    `
      SELECT id
      FROM meeting_requests
      WHERE meeting_date = $1
        AND slot_id = $2
        AND executive_role = $3
        AND status = 'pending_approval'
      ORDER BY created_at DESC
    `,
    [req.params.meetingDate, req.params.slotId, req.params.executiveRole]
  )

  const existing = existingResult.data[0]
  const hasPendingRequest = pendingResult.data.length > 0

  if (session.accessType === 'department') {
    const bookedByName = req.params.bookedByName?.trim()
    if (!bookedByName) {
      throw new Error('Your name is required.')
    }

    const meetingPurpose = req.params.meetingPurpose?.trim()
    if (!meetingPurpose) {
      throw new Error('Purpose of meeting is required.')
    }

    const isEmergency = req.params.isEmergency === true
    if (!isEmergency && (existing || hasPendingRequest)) {
      throw new Error('This slot is no longer available.')
    }

    await retoolDb.query(
      `
        INSERT INTO meeting_requests (
          meeting_date,
          slot_id,
          executive_role,
          status,
          department_name,
          booked_by_name,
          meeting_purpose,
          is_emergency,
          replaces_slot_id
        )
        VALUES ($1, $2, $3, 'pending_approval', $4, $5, $6, $7, $8)
      `,
      [
        req.params.meetingDate,
        req.params.slotId,
        req.params.executiveRole,
        session.departmentName,
        bookedByName,
        meetingPurpose,
        isEmergency,
        existing?.id ?? null,
      ]
    )
  } else {
    if (existing) {
      throw new Error('This slot is already reserved.')
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
        VALUES ($1, $2, $3, 'booked', NULL, NULL, NULL, $4, $5, $6)
      `,
      [
        req.params.meetingDate,
        req.params.slotId,
        req.params.executiveRole,
        `${getExecutiveDisplayName(req.params.executiveRole)} blocked this slot`,
        session.accessType,
        session.displayName,
      ]
    )
  }

  return { success: true }
}
