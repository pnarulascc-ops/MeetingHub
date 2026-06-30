export const SLOT_IDS = [
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
] as const

export type SlotId = (typeof SLOT_IDS)[number]
export type AccessType = 'department' | 'jmd' | 'cmd'
export type ExecutiveRole = 'jmd' | 'cmd'
export type BookingSlotStatus = 'booked' | 'blocked'
export type RequestStatus = 'pending_approval' | 'approved' | 'rejected' | 'cancelled'
export type SlotStatus = BookingSlotStatus | RequestStatus

export type AccessMatch =
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

export const SESSION_TTL_DAYS = 30

export function matchAccessCode(rawCode: string): AccessMatch | null {
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

export function isExecutiveRole(value: string): value is ExecutiveRole {
  return value === 'jmd' || value === 'cmd'
}

export function isValidMeetingDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function isValidSlotId(value: string): value is SlotId {
  return (SLOT_IDS as readonly string[]).includes(value)
}

export function getExecutiveDisplayName(role: ExecutiveRole): string {
  return role === 'jmd' ? 'JMD' : 'CMD'
}

export default {
  SLOT_IDS,
  SESSION_TTL_DAYS,
  matchAccessCode,
  isExecutiveRole,
  isValidMeetingDate,
  isValidSlotId,
  getExecutiveDisplayName,
}
