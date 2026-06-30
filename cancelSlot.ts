import { isExecutiveRole, isValidMeetingDate, isValidSlotId } from './config.ts'
import { ensureMeetingTables, getSessionFromToken, requireExecutive } from './session.ts'

type Params = {
  sessionToken: string
  meetingDate: string
  slotId: string
  executiveRole: string
}

export default async function cancelSlot(req: { params: Params; user: User }) {
  const session = await getSessionFromToken(req.params.sessionToken)
  if (!session) {
    throw new Error('Session expired. Please log in again.')
  }

  const executiveRole = requireExecutive(session)

  if (!isValidMeetingDate(req.params.meetingDate)) {
    throw new Error('Invalid meeting date.')
  }

  if (!isValidSlotId(req.params.slotId)) {
    throw new Error('Invalid slot.')
  }

  if (!isExecutiveRole(req.params.executiveRole)) {
    throw new Error('Invalid executive role.')
  }

  if (req.params.executiveRole !== executiveRole) {
    throw new Error('You can only manage your own calendar.')
  }

  await ensureMeetingTables()

  await retoolDb.query(
    `
      DELETE FROM meeting_slots
      WHERE meeting_date = $1
        AND slot_id = $2
        AND executive_role = $3
    `,
    [req.params.meetingDate, req.params.slotId, req.params.executiveRole]
  )

  await retoolDb.query(
    `
      DELETE FROM meeting_requests
      WHERE meeting_date = $1
        AND slot_id = $2
        AND executive_role = $3
        AND status = 'pending_approval'
    `,
    [req.params.meetingDate, req.params.slotId, req.params.executiveRole]
  )

  return { success: true }
}
