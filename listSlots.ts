import { SLOT_IDS, type ExecutiveRole, type SlotId, type SlotStatus, isExecutiveRole, isValidMeetingDate, isValidSlotId } from './config.ts'
import { ensureMeetingTables, getSessionFromToken } from './session.ts'

type Params = {
  sessionToken: string
  meetingDate: string
}

type SlotRow = {
  id: number
  meeting_date: string
  slot_id: SlotId
  executive_role: ExecutiveRole
  status: SlotStatus
  department_name: string | null
  booked_by_name: string | null
  meeting_purpose: string | null
  note: string | null
  created_by_role: string
  created_by_display_name: string
}

type RequestRow = {
  id: number
  meeting_date: string
  slot_id: SlotId
  executive_role: ExecutiveRole
  status: 'pending_approval' | 'approved' | 'rejected'
  department_name: string
  booked_by_name: string
  meeting_purpose: string
  remarks: string | null
  is_emergency: boolean
}

type SlotView = {
  recordId: number | null
  meetingDate: string
  slotId: SlotId
  executiveRole: ExecutiveRole
  status: SlotStatus | 'available'
  departmentName: string | null
  bookedByName: string | null
  meetingPurpose: string | null
  note: string | null
  createdByRole: string | null
  createdByDisplayName: string | null
  isEmergency: boolean
}

type ApprovalRequestView = {
  requestId: number
  meetingDate: string
  slotId: SlotId
  executiveRole: ExecutiveRole
  status: 'pending_approval'
  departmentName: string
  bookedByName: string
  meetingPurpose: string
  remarks: string | null
  isEmergency: boolean
}

type DepartmentRequestView = {
  requestId: number
  meetingDate: string
  slotId: SlotId
  executiveRole: ExecutiveRole
  status: Exclude<SlotStatus, 'blocked' | 'available' | 'cancelled'>
  bookedByName: string
  meetingPurpose: string
  remarks: string | null
  isEmergency: boolean
}

type SummaryRequestRow = {
  id: number
  meeting_date: string
  slot_id: SlotId
  executive_role: ExecutiveRole
  department_name: string
  booked_by_name: string
  meeting_purpose: string
  status: 'pending_approval' | 'approved' | 'rejected'
  remarks: string | null
  created_at: string
}

type SummaryManagementRow = {
  id: number
  meeting_date: string
  slot_id: SlotId
  executive_role: ExecutiveRole
  created_by_display_name: string
  note: string | null
  created_at: string
}

type SummarySheetRow = {
  rowId: string
  meetingDate: string
  slotId: SlotId
  executiveRole: ExecutiveRole
  departmentName: string
  attendeeName: string
  meetingPurpose: string
  status: 'booked' | 'pending_approval' | 'approved' | 'rejected'
  remarks: string | null
  createdAt: string
}

export default async function listSlots(req: { params: Params; user: User }) {
  const session = await getSessionFromToken(req.params.sessionToken)
  if (!session) {
    throw new Error('Session expired. Please log in again.')
  }

  if (!isValidMeetingDate(req.params.meetingDate)) {
    throw new Error('Invalid meeting date.')
  }

  await ensureMeetingTables()

  const executiveRoleFilter = session.accessType === 'department' ? null : session.accessType
  const slotQueryParams = executiveRoleFilter ? [req.params.meetingDate, executiveRoleFilter] : [req.params.meetingDate]
  const slotRoleClause = executiveRoleFilter ? 'AND executive_role = $2' : ''

  const result = await retoolDb.query<SlotRow>(
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
        note,
        created_by_role,
        created_by_display_name
      FROM meeting_slots
      WHERE meeting_date = $1
        AND status != 'cancelled'
        ${slotRoleClause}
      ORDER BY executive_role, slot_id
    `,
    slotQueryParams
  )

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
        remarks,
        is_emergency
      FROM meeting_requests
      WHERE meeting_date = $1
        AND status = 'pending_approval'
        ${slotRoleClause}
      ORDER BY created_at DESC
    `,
    slotQueryParams
  )

  const departmentHistoryResult = session.accessType === 'department' && session.departmentName
    ? await retoolDb.query<RequestRow>(
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
            remarks,
            is_emergency
          FROM meeting_requests
          WHERE meeting_date = $1
            AND department_name = $2
          ORDER BY created_at DESC
        `,
        [req.params.meetingDate, session.departmentName]
      )
    : { data: [] as RequestRow[] }

  const summaryRequestResult = session.accessType === 'department'
    ? { data: [] as SummaryRequestRow[] }
    : await retoolDb.query<SummaryRequestRow>(
        `
          SELECT
            id,
            meeting_date,
            slot_id,
            executive_role,
            department_name,
            booked_by_name,
            meeting_purpose,
            status,
            remarks,
            created_at
          FROM meeting_requests
          WHERE meeting_date = $1
            AND executive_role = $2
          ORDER BY created_at DESC, slot_id ASC
        `,
        [req.params.meetingDate, session.accessType]
      )

  const summaryManagementResult = session.accessType === 'department'
    ? { data: [] as SummaryManagementRow[] }
    : await retoolDb.query<SummaryManagementRow>(
        `
          SELECT
            id,
            meeting_date,
            slot_id,
            executive_role,
            created_by_display_name,
            note,
            created_at
          FROM meeting_slots
          WHERE meeting_date = $1
            AND executive_role = $2
            AND created_by_role IN ('jmd', 'cmd')
          ORDER BY created_at DESC, slot_id ASC
        `,
        [req.params.meetingDate, session.accessType]
      )

  const rows = result.data.filter(
    (row): row is SlotRow => isExecutiveRole(row.executive_role) && isValidSlotId(row.slot_id)
  )
  const requestRows = requestResult.data.filter(
    (row): row is RequestRow => isExecutiveRole(row.executive_role) && isValidSlotId(row.slot_id)
  )

  const occupiedMap = new Map<string, SlotView>()

  for (const row of rows) {
    occupiedMap.set(`${row.executive_role}:${row.slot_id}`, {
      recordId: row.id,
      meetingDate: row.meeting_date,
      slotId: row.slot_id,
      executiveRole: row.executive_role,
      status: row.status,
      departmentName: row.department_name,
      bookedByName: row.booked_by_name,
      meetingPurpose: row.meeting_purpose,
      note: row.note,
      createdByRole: row.created_by_role,
      createdByDisplayName: row.created_by_display_name,
      isEmergency: false,
    })
  }

  for (const row of requestRows) {
    const key = `${row.executive_role}:${row.slot_id}`
    if (occupiedMap.has(key)) {
      continue
    }

    occupiedMap.set(key, {
      recordId: row.id,
      meetingDate: row.meeting_date,
      slotId: row.slot_id,
      executiveRole: row.executive_role,
      status: row.status,
      departmentName: row.department_name,
      bookedByName: row.booked_by_name,
      meetingPurpose: row.meeting_purpose,
      note: row.is_emergency ? 'Emergency request awaiting approval' : 'Pending Approval',
      createdByRole: 'department',
      createdByDisplayName: row.department_name,
      isEmergency: row.is_emergency,
    })
  }

  const executiveRoles: ExecutiveRole[] = session.accessType === 'department' ? ['jmd', 'cmd'] : [session.accessType]

  const slots: SlotView[] = []
  for (const executiveRole of executiveRoles) {
    for (const slotId of SLOT_IDS) {
      const key = `${executiveRole}:${slotId}`
      const existing = occupiedMap.get(key)
      if (existing) {
        slots.push(existing)
      } else {
        slots.push({
          recordId: null,
          meetingDate: req.params.meetingDate,
          slotId,
          executiveRole,
          status: 'available',
          departmentName: null,
          bookedByName: null,
          meetingPurpose: null,
          note: null,
          createdByRole: null,
          createdByDisplayName: null,
          isEmergency: false,
        })
      }
    }
  }

  const approvalRequests: ApprovalRequestView[] = requestRows.map((row) => ({
    requestId: row.id,
    meetingDate: row.meeting_date,
    slotId: row.slot_id,
    executiveRole: row.executive_role,
    status: row.status,
    departmentName: row.department_name,
    bookedByName: row.booked_by_name,
    meetingPurpose: row.meeting_purpose,
    remarks: row.remarks,
    isEmergency: row.is_emergency,
  }))

  const departmentRequests: DepartmentRequestView[] = departmentHistoryResult.data
    .filter((row): row is RequestRow => isExecutiveRole(row.executive_role) && isValidSlotId(row.slot_id))
    .map((row) => ({
      requestId: row.id,
      meetingDate: row.meeting_date,
      slotId: row.slot_id,
      executiveRole: row.executive_role,
      status: row.status,
      bookedByName: row.booked_by_name,
      meetingPurpose: row.meeting_purpose,
      remarks: row.remarks,
      isEmergency: row.is_emergency,
    }))

  const summaryRows: SummarySheetRow[] = [
    ...summaryRequestResult.data
      .filter((row) => isExecutiveRole(row.executive_role) && isValidSlotId(row.slot_id))
      .map((row) => ({
        rowId: `request-${row.id}`,
        meetingDate: row.meeting_date,
        slotId: row.slot_id,
        executiveRole: row.executive_role,
        departmentName: row.department_name,
        attendeeName: row.booked_by_name,
        meetingPurpose: row.meeting_purpose,
        status: row.status,
        remarks: row.remarks,
        createdAt: row.created_at,
      })),
    ...summaryManagementResult.data
      .filter((row) => isExecutiveRole(row.executive_role) && isValidSlotId(row.slot_id))
      .map((row) => ({
        rowId: `management-${row.id}`,
        meetingDate: row.meeting_date,
        slotId: row.slot_id,
        executiveRole: row.executive_role,
        departmentName: 'Management',
        attendeeName: row.created_by_display_name,
        meetingPurpose: row.note ?? 'Management reservation',
        status: 'booked' as const,
        remarks: null,
        createdAt: row.created_at,
      })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return {
    session,
    slots,
    approvalRequests,
    departmentRequests,
    summaryRows,
  }
}
