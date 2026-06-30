import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, Check, LogOut, MessageSquareText, ShieldCheck, UserRound, X } from 'lucide-react'

import { useApproveRequest, useBookSlot, useCancelSlot, useDeleteRequest, useGetSession, useListSlots, useLogin, useLogout, useRejectRequest, useUpdateRequest } from '../hooks/backend/meeting'
import { Badge } from '../lib/shadcn/badge'
import { Button } from '../lib/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../lib/shadcn/card'
import { Input } from '../lib/shadcn/input'
import { Label } from '../lib/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { Switch } from '../lib/shadcn/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/shadcn/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../lib/shadcn/tabs'
import { Textarea } from '../lib/shadcn/textarea'
import {
  EXECUTIVE_LABELS,
  EXECUTIVE_SHORT_LABELS,
  SESSION_STORAGE_KEY,
  formatHumanDate,
  getStatusLabel,
  getStatusVariant,
  getTodayDate,
  isExecutive,
  sortSlots,
  type ApprovalRequestView,
  type DepartmentRequestView,
  type ExecutiveRole,
  type SessionContext,
  type SessionRecord,
  type SlotView,
  type SummarySheetRow,
} from '../utils/meeting'

type LoginRole = 'department' | 'jmd' | 'cmd'
type ActiveTab = 'department-booking' | 'approval' | 'jmd-dashboard' | 'cmd-dashboard' | 'summary-sheet'

type SlotsResponse = {
  session: SessionContext
  slots: SlotView[]
  approvalRequests: ApprovalRequestView[]
  departmentRequests: DepartmentRequestView[]
  summaryRows: SummarySheetRow[]
}

type SessionLookup = {
  session: SessionContext | null
}

type LoginFormState = {
  loginAs: LoginRole
  accessCode: string
}

type BookingFormState = {
  executiveRole: ExecutiveRole
  slotId: string
  bookedByName: string
  meetingPurpose: string
  isEmergency: boolean
}

type ApprovalRemarksState = Record<number, string>

function readStoredSessionToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredSessionToken(sessionToken: string | null): void {
  try {
    if (sessionToken) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, sessionToken)
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures.
  }
}

function getDefaultActiveTab(session: SessionContext): ActiveTab {
  if (session.accessType === 'department') {
    return 'department-booking'
  }

  return 'approval'
}

function groupSlotsByExecutive(slots: SlotView[]): Record<ExecutiveRole, SlotView[]> {
  return {
    jmd: sortSlots(slots.filter((slot) => slot.executiveRole === 'jmd')),
    cmd: sortSlots(slots.filter((slot) => slot.executiveRole === 'cmd')),
  }
}

function getSlotIdentity(slot: Pick<SlotView, 'executiveRole' | 'slotId'>): string {
  return `${slot.executiveRole}:${slot.slotId}`
}

function canDepartmentSelectSlot(slot: SlotView, isEmergency: boolean): boolean {
  if (slot.status === 'available') {
    return true
  }

  if (!isEmergency) {
    return false
  }

  return slot.status === 'booked' || slot.status === 'pending_approval'
}

function getSlotBadgeLabel(slot: SlotView, maskPrivateDetails: boolean): string {
  if (!maskPrivateDetails) {
    return getStatusLabel(slot.status)
  }

  if (slot.status === 'pending_approval') {
    return 'Unavailable'
  }

  if (slot.status === 'booked' || slot.status === 'blocked') {
    return 'Booked'
  }

  return getStatusLabel(slot.status)
}

function getSlotDetail(slot: SlotView, maskPrivateDetails: boolean): string {
  if (slot.status === 'available') {
    return 'Open for booking'
  }

  if (maskPrivateDetails) {
    if (slot.status === 'pending_approval') {
      return 'Unavailable'
    }

    if (slot.status === 'booked' || slot.status === 'blocked') {
      return 'Booked'
    }
  }

  if (slot.status === 'pending_approval') {
    const name = slot.bookedByName ?? 'Unknown person'
    const department = slot.departmentName ?? 'Department'
    return `${department} • ${name}`
  }

  if (slot.status === 'booked') {
    if (slot.createdByRole === 'jmd' || slot.createdByRole === 'cmd') {
      return slot.note ?? 'Reserved by management'
    }

    const name = slot.bookedByName ?? 'Unknown person'
    const department = slot.departmentName ?? 'Department'
    return `${department} • ${name}`
  }

  if (slot.status === 'blocked') {
    return slot.note ?? 'Reserved by management'
  }

  return slot.note ?? getStatusLabel(slot.status)
}

function getDepartmentRequestStatusTone(status: DepartmentRequestView['status']): string {
  if (status === 'approved') {
    return 'text-success'
  }
  if (status === 'rejected') {
    return 'text-destructive'
  }
  return 'text-warning'
}

function LoginScreen({
  form,
  onFormChange,
  onSubmit,
  loading,
  error,
}: {
  form: LoginFormState
  onFormChange: (value: LoginFormState) => void
  onSubmit: () => void
  loading: boolean
  error: string | null
}) {
  const accessCodeLabel = form.loginAs === 'department' ? 'Department Access Code' : `${form.loginAs.toUpperCase()} Password`

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md border-border shadow-retool-lg">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-border bg-primary/10 p-3 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl tracking-tight">Meeting Hub</CardTitle>
              <CardDescription>Choose your role, enter your code once, and continue straight into the right private workspace.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="login-as">Login As</Label>
            <Select
              value={form.loginAs}
              onValueChange={(value) => onFormChange({ loginAs: value as LoginRole, accessCode: '' })}
            >
              <SelectTrigger id="login-as">
                <SelectValue placeholder="Choose role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="jmd">JMD</SelectItem>
                <SelectItem value="cmd">CMD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access-code">{accessCodeLabel}</Label>
            <Input
              id="access-code"
              type="password"
              value={form.accessCode}
              onChange={(event) => onFormChange({ ...form, accessCode: event.target.value })}
              placeholder={accessCodeLabel}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSubmit()
                }
              }}
            />
          </div>

          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

          <Button className="w-full" onClick={onSubmit} disabled={loading || !form.accessCode.trim()}>
            {loading ? 'Signing in...' : 'Continue'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SlotGrid({
  title,
  description,
  slots,
  selectedSlotId,
  isEmergency,
  onSelect,
  onCancel,
  busyActionId,
  allowDepartmentSelection,
  allowManagementSelection,
  allowManagementCancel,
  maskPrivateDetails,
}: {
  title: string
  description: string
  slots: SlotView[]
  selectedSlotId: string | null
  isEmergency: boolean
  onSelect: (slot: SlotView) => void
  onCancel: (slot: SlotView) => void
  busyActionId: string | null
  allowDepartmentSelection: boolean
  allowManagementSelection: boolean
  allowManagementCancel: boolean
  maskPrivateDetails: boolean
}) {
  return (
    <Card className="border-border shadow-retool-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg tracking-tight">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {slots.map((slot) => {
            const slotKey = getSlotIdentity(slot)
            const isSelected = selectedSlotId === slot.slotId
            const departmentSelectable = allowDepartmentSelection && canDepartmentSelectSlot(slot, isEmergency)
            const managementSelectable = allowManagementSelection && slot.status === 'available'
            const isSelectable = departmentSelectable || managementSelectable
            const isBusy = busyActionId === slotKey

            return (
              <div
                key={slotKey}
                role={isSelectable ? 'button' : undefined}
                tabIndex={isSelectable ? 0 : undefined}
                onClick={() => {
                  if (isSelectable) {
                    onSelect(slot)
                  }
                }}
                onKeyDown={(event) => {
                  if (!isSelectable) {
                    return
                  }

                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(slot)
                  }
                }}
                className={[
                  'rounded-xl border p-4 text-left shadow-sm transition-all',
                  isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card',
                  isSelectable ? 'cursor-pointer hover:border-primary/70 hover:bg-accent/30' : 'cursor-default',
                  !isSelectable && !allowManagementCancel ? 'opacity-85' : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold tracking-tight text-foreground">{slot.slotId}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{EXECUTIVE_SHORT_LABELS[slot.executiveRole]}</p>
                  </div>
                  <Badge variant={slot.status === 'pending_approval' ? 'warning' : getStatusVariant(slot.status)}>
                    {getSlotBadgeLabel(slot, maskPrivateDetails)}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2 text-sm text-body-foreground">
                  {slot.isEmergency && !maskPrivateDetails ? (
                    <p className="font-semibold text-destructive">EMERGENCY REQUEST</p>
                  ) : null}
                  <p className={slot.status === 'pending_approval' && !maskPrivateDetails ? 'font-semibold text-warning' : ''}>
                    {getSlotDetail(slot, maskPrivateDetails)}
                  </p>
                  {!maskPrivateDetails && slot.meetingPurpose ? <p className="text-xs leading-relaxed text-muted-foreground">Agenda: {slot.meetingPurpose}</p> : null}
                  {slot.note && slot.status === 'booked' && (slot.createdByRole === 'jmd' || slot.createdByRole === 'cmd') ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">{slot.note}</p>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {departmentSelectable ? (
                    <span className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                      {isSelected ? 'Selected' : 'Click to select'}
                    </span>
                  ) : null}
                  {managementSelectable ? (
                    <span className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                      Click to reserve
                    </span>
                  ) : null}
                  {allowManagementCancel && slot.status !== 'available' ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(event) => {
                        event.stopPropagation()
                        onCancel(slot)
                      }}
                      disabled={isBusy}
                    >
                      {isBusy ? 'Clearing...' : 'Clear Slot'}
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function ApprovalQueue({
  requests,
  remarksByRequest,
  busyRequestId,
  onRemarkChange,
  onApprove,
  onReject,
}: {
  requests: ApprovalRequestView[]
  remarksByRequest: ApprovalRemarksState
  busyRequestId: number | null
  onRemarkChange: (requestId: number, value: string) => void
  onApprove: (request: ApprovalRequestView) => void
  onReject: (request: ApprovalRequestView) => void
}) {
  return (
    <Card className="border-border shadow-retool-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg tracking-tight">Approval</CardTitle>
        <CardDescription>Review pending department requests, add remarks, and decide whether to approve or reject them.</CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            No pending requests for this date.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Booked By</TableHead>
                <TableHead>Agenda</TableHead>
                <TableHead>Remarks / Comments</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[220px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => {
                const isBusy = busyRequestId === request.requestId
                return (
                  <TableRow key={request.requestId}>
                    <TableCell className="font-medium">{request.slotId}</TableCell>
                    <TableCell>{request.departmentName}</TableCell>
                    <TableCell>{request.bookedByName}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {request.isEmergency ? <p className="font-semibold text-destructive">EMERGENCY REQUEST</p> : null}
                        <p className={request.isEmergency ? 'text-destructive' : ''}>{request.meetingPurpose}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={remarksByRequest[request.requestId] ?? ''}
                        onChange={(event) => onRemarkChange(request.requestId, event.target.value)}
                        placeholder="Add approval or rejection remarks"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={request.isEmergency ? 'destructive' : 'warning'}>
                        {request.isEmergency ? 'Emergency' : 'Pending Approval'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => onApprove(request)} disabled={isBusy}>
                          <Check className="h-4 w-4" />
                          {isBusy ? 'Working...' : 'Approve'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onReject(request)} disabled={isBusy}>
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function DepartmentRequestsLog({
  requests,
  busyRequestId,
  onEdit,
  onCancel,
}: {
  requests: DepartmentRequestView[]
  busyRequestId: number | null
  onEdit: (request: DepartmentRequestView) => void
  onCancel: (request: DepartmentRequestView) => void
}) {
  return (
    <Card className="border-border shadow-retool-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          My Bookings
        </CardTitle>
        <CardDescription>Review your requests, edit pending ones, or cancel mistaken submissions before approval.</CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            No requests logged for this date.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => {
              const isPending = request.status === 'pending_approval'
              const isBusy = busyRequestId === request.requestId

              return (
                <div key={request.requestId} className="rounded-xl border border-border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {request.slotId} • {EXECUTIVE_SHORT_LABELS[request.executiveRole]}
                      </p>
                      <p className="text-sm text-body-foreground">{request.meetingPurpose}</p>
                      {request.isEmergency ? <p className="text-sm font-semibold text-destructive">EMERGENCY REQUEST</p> : null}
                    </div>
                    <Badge variant={request.status === 'pending_approval' ? 'warning' : getStatusVariant(request.status)}>
                      {getStatusLabel(request.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      <span className="font-medium text-foreground">Booked By:</span> {request.bookedByName}
                    </p>
                    <p className={getDepartmentRequestStatusTone(request.status)}>
                      <span className="font-medium text-foreground">Request Status:</span> {getStatusLabel(request.status)}
                    </p>
                  </div>
                  {request.remarks ? (
                    <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                      <span className="font-medium text-foreground">Remarks:</span> {request.remarks}
                    </div>
                  ) : null}
                  {isPending ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEdit(request)} disabled={isBusy}>
                        {isBusy ? 'Working...' : 'Edit'}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onCancel(request)} disabled={isBusy}>
                        {isBusy ? 'Cancelling...' : 'Cancel Request'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SummarySheet({ rows }: { rows: SummarySheetRow[] }) {
  return (
    <Card className="border-border shadow-retool-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg tracking-tight">Summary Sheet</CardTitle>
        <CardDescription>A master tracking table of all requests and management reservations for fast scanning.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            No records available for this date.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Attendee Name</TableHead>
                <TableHead>Meeting Purpose</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.rowId}>
                  <TableCell>{formatHumanDate(row.meetingDate)}</TableCell>
                  <TableCell className="font-medium">{row.slotId}</TableCell>
                  <TableCell>{row.departmentName}</TableCell>
                  <TableCell>{row.attendeeName}</TableCell>
                  <TableCell>{row.meetingPurpose}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'pending_approval' ? 'warning' : getStatusVariant(row.status)}>
                      {getStatusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.remarks ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function MeetingSchedulerApp() {
  const { loading: loginLoading, error: loginError, trigger: triggerLogin } = useLogin()
  const { trigger: triggerLogout } = useLogout()
  const { trigger: triggerGetSession } = useGetSession()
  const { data: slotsData, loading: slotsLoading, error: slotsError, trigger: triggerListSlots } = useListSlots()
  const { loading: bookingLoading, error: bookingError, trigger: triggerBookSlot } = useBookSlot()
  const { error: cancellingError, trigger: triggerCancelSlot } = useCancelSlot()
  const { error: deleteRequestError, trigger: triggerDeleteRequest } = useDeleteRequest()
  const { error: updateRequestError, trigger: triggerUpdateRequest } = useUpdateRequest()
  const { error: approveError, trigger: triggerApproveRequest } = useApproveRequest()
  const { error: rejectError, trigger: triggerRejectRequest } = useRejectRequest()

  const [loginForm, setLoginForm] = useState<LoginFormState>({ loginAs: 'department', accessCode: '' })
  const [bookingForm, setBookingForm] = useState<BookingFormState>({
    executiveRole: 'jmd',
    slotId: '',
    bookedByName: '',
    meetingPurpose: '',
    isEmergency: false,
  })
  const [meetingDate, setMeetingDate] = useState(getTodayDate())
  const [session, setSession] = useState<SessionContext | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('department-booking')
  const [initializing, setInitializing] = useState(true)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)
  const [busyRequestId, setBusyRequestId] = useState<number | null>(null)
  const [surfaceError, setSurfaceError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [approvalRemarks, setApprovalRemarks] = useState<ApprovalRemarksState>({})
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null)

  useEffect(() => {
    const storedToken = readStoredSessionToken()
    if (!storedToken) {
      setInitializing(false)
      return
    }

    const handle = triggerGetSession({ sessionToken: storedToken })
    handle.result
      .then((value: SessionLookup) => {
        if (value.session) {
          setSession(value.session)
          setSessionToken(storedToken)
          setActiveTab(getDefaultActiveTab(value.session))
        } else {
          writeStoredSessionToken(null)
        }
      })
      .catch(() => {
        writeStoredSessionToken(null)
      })
      .finally(() => {
        setInitializing(false)
      })
  }, [triggerGetSession])

  useEffect(() => {
    if (!sessionToken) {
      return
    }

    triggerListSlots({ sessionToken, meetingDate }, { skipCache: true }).result
      .then((value: SlotsResponse) => {
        setSession(value.session)
      })
      .catch((error: unknown) => {
        setSurfaceError(error instanceof Error ? error.message : 'Failed to load slots.')
      })
  }, [meetingDate, sessionToken, triggerListSlots])

  const response = (slotsData as SlotsResponse | null) ?? null
  const slots = response?.slots ?? []
  const approvalRequests = response?.approvalRequests ?? []
  const departmentRequests = response?.departmentRequests ?? []
  const summaryRows = response?.summaryRows ?? []
  const groupedSlots = useMemo(() => groupSlotsByExecutive(slots), [slots])

  const visibleTabs = useMemo<ActiveTab[]>(() => {
    if (!session) {
      return ['department-booking']
    }

    if (session.accessType === 'department') {
      return ['department-booking']
    }

    if (session.accessType === 'jmd') {
      return ['approval', 'jmd-dashboard', 'summary-sheet']
    }

    return ['approval', 'cmd-dashboard', 'summary-sheet']
  }, [session])

  useEffect(() => {
    const firstVisibleTab = visibleTabs.at(0)
    if (!firstVisibleTab) {
      return
    }

    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(firstVisibleTab)
    }
  }, [activeTab, visibleTabs])

  const currentExecutiveRole = session && isExecutive(session.accessType) ? session.accessType : null
  const departmentSlots = groupedSlots[bookingForm.executiveRole]
  const selectedSlot = departmentSlots.find((slot) => slot.slotId === bookingForm.slotId) ?? null
  const visibleApprovalRequests = approvalRequests.filter((request) => {
    if (!currentExecutiveRole) {
      return false
    }

    return request.executiveRole === currentExecutiveRole
  })

  useEffect(() => {
    if (!bookingForm.slotId) {
      return
    }

    if (selectedSlot && canDepartmentSelectSlot(selectedSlot, bookingForm.isEmergency)) {
      return
    }

    setBookingForm((current) => ({ ...current, slotId: '' }))
  }, [bookingForm.slotId, bookingForm.isEmergency, selectedSlot])

  async function refreshSlots(): Promise<void> {
    if (!sessionToken) {
      return
    }

    const result = (await triggerListSlots({ sessionToken, meetingDate }, { skipCache: true }).result) as SlotsResponse
    setSession(result.session)
  }

  async function handleLogin(): Promise<void> {
    setSurfaceError(null)
    setSuccessMessage(null)

    try {
      const result = (await triggerLogin({ accessCode: loginForm.accessCode, loginAs: loginForm.loginAs }).result) as SessionRecord
      setSession({
        accessType: result.accessType,
        departmentName: result.departmentName,
        displayName: result.displayName,
        expiresAt: result.expiresAt,
      })
      setSessionToken(result.sessionToken)
      writeStoredSessionToken(result.sessionToken)
      setActiveTab(getDefaultActiveTab(result))
      setLoginForm((current) => ({ ...current, accessCode: '' }))
    } catch (error) {
      setSurfaceError(error instanceof Error ? error.message : 'Unable to sign in.')
    }
  }

  async function handleLogout(): Promise<void> {
    if (sessionToken) {
      await triggerLogout({ sessionToken }).result.catch(() => null)
    }

    writeStoredSessionToken(null)
    setSession(null)
    setSessionToken(null)
    setSurfaceError(null)
    setSuccessMessage(null)
    setApprovalRemarks({})
    setBookingForm({
      executiveRole: 'jmd',
      slotId: '',
      bookedByName: '',
      meetingPurpose: '',
      isEmergency: false,
    })
  }

  async function handleDepartmentBooking(): Promise<void> {
    if (!sessionToken) {
      return
    }

    if (!bookingForm.slotId) {
      setSurfaceError('Please select a time card from the dashboard.')
      return
    }

    setSurfaceError(null)
    setSuccessMessage(null)
    const slotKey = `${bookingForm.executiveRole}:${bookingForm.slotId}`
    setBusyActionId(slotKey)

    try {
      if (editingRequestId) {
        await triggerUpdateRequest({
          sessionToken,
          requestId: editingRequestId,
          meetingDate,
          slotId: bookingForm.slotId,
          executiveRole: bookingForm.executiveRole,
          bookedByName: bookingForm.bookedByName,
          meetingPurpose: bookingForm.meetingPurpose,
          isEmergency: bookingForm.isEmergency,
        }).result
        setSuccessMessage('Request updated successfully.')
      } else {
        await triggerBookSlot({
          sessionToken,
          meetingDate,
          slotId: bookingForm.slotId,
          executiveRole: bookingForm.executiveRole,
          bookedByName: bookingForm.bookedByName,
          meetingPurpose: bookingForm.meetingPurpose,
          isEmergency: bookingForm.isEmergency,
        }).result
        setSuccessMessage('Request submitted for approval.')
      }
      setEditingRequestId(null)
      setBookingForm((current) => ({
        executiveRole: current.executiveRole,
        slotId: '',
        bookedByName: '',
        meetingPurpose: '',
        isEmergency: false,
      }))
      await refreshSlots()
    } catch (error) {
      setSurfaceError(error instanceof Error ? error.message : 'Booking request failed.')
    } finally {
      setBusyActionId(null)
    }
  }

  async function handleDepartmentCancelRequest(request: DepartmentRequestView): Promise<void> {
    if (!sessionToken) {
      return
    }

    setSurfaceError(null)
    setSuccessMessage(null)
    setBusyRequestId(request.requestId)

    try {
      await triggerDeleteRequest({ sessionToken, requestId: request.requestId }).result
      if (editingRequestId === request.requestId) {
        setEditingRequestId(null)
        setBookingForm((current) => ({
          ...current,
          slotId: '',
          bookedByName: '',
          meetingPurpose: '',
          isEmergency: false,
        }))
      }
      setSuccessMessage('Request cancelled and slot reopened.')
      await refreshSlots()
    } catch (error) {
      setSurfaceError(error instanceof Error ? error.message : 'Unable to cancel request.')
    } finally {
      setBusyRequestId(null)
    }
  }

  async function handleManagementReserve(slot: SlotView): Promise<void> {
    if (!sessionToken || !currentExecutiveRole) {
      return
    }

    setSurfaceError(null)
    setSuccessMessage(null)
    const slotKey = getSlotIdentity(slot)
    setBusyActionId(slotKey)

    try {
      await triggerBookSlot({
        sessionToken,
        meetingDate,
        slotId: slot.slotId,
        executiveRole: currentExecutiveRole,
      }).result
      setSuccessMessage('Slot reserved successfully.')
      await refreshSlots()
    } catch (error) {
      setSurfaceError(error instanceof Error ? error.message : 'Unable to reserve slot.')
    } finally {
      setBusyActionId(null)
    }
  }

  async function handleManagementClear(slot: SlotView): Promise<void> {
    if (!sessionToken || !currentExecutiveRole) {
      return
    }

    setSurfaceError(null)
    setSuccessMessage(null)
    const slotKey = getSlotIdentity(slot)
    setBusyActionId(slotKey)

    try {
      await triggerCancelSlot({
        sessionToken,
        meetingDate,
        slotId: slot.slotId,
        executiveRole: currentExecutiveRole,
      }).result
      setSuccessMessage('Slot cleared successfully.')
      await refreshSlots()
    } catch (error) {
      setSurfaceError(error instanceof Error ? error.message : 'Unable to clear slot.')
    } finally {
      setBusyActionId(null)
    }
  }

  async function handleApproveRequest(request: ApprovalRequestView): Promise<void> {
    if (!sessionToken) {
      return
    }

    setSurfaceError(null)
    setSuccessMessage(null)
    setBusyRequestId(request.requestId)

    try {
      await triggerApproveRequest({
        sessionToken,
        requestId: request.requestId,
        remarks: approvalRemarks[request.requestId] ?? '',
      }).result
      setSuccessMessage('Request approved and converted into a booked slot.')
      setApprovalRemarks((current) => {
        const next = { ...current }
        delete next[request.requestId]
        return next
      })
      await refreshSlots()
    } catch (error) {
      setSurfaceError(error instanceof Error ? error.message : 'Unable to approve request.')
    } finally {
      setBusyRequestId(null)
    }
  }

  async function handleRejectRequest(request: ApprovalRequestView): Promise<void> {
    if (!sessionToken) {
      return
    }

    setSurfaceError(null)
    setSuccessMessage(null)
    setBusyRequestId(request.requestId)

    try {
      await triggerRejectRequest({
        sessionToken,
        requestId: request.requestId,
        remarks: approvalRemarks[request.requestId] ?? '',
      }).result
      setSuccessMessage('Request rejected.')
      setApprovalRemarks((current) => {
        const next = { ...current }
        delete next[request.requestId]
        return next
      })
      await refreshSlots()
    } catch (error) {
      setSurfaceError(error instanceof Error ? error.message : 'Unable to reject request.')
    } finally {
      setBusyRequestId(null)
    }
  }

  if (initializing) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-foreground">Loading session...</div>
  }

  if (!session) {
    return (
      <LoginScreen
        form={loginForm}
        onFormChange={setLoginForm}
        onSubmit={() => {
          void handleLogin()
        }}
        loading={loginLoading}
        error={surfaceError ?? loginError}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Meeting Hub</h1>
            <p className="text-sm text-muted-foreground">A polished scheduling workspace for approvals, management reservations, and department requests.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{session.displayName}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={meetingDate}
                onChange={(event) => setMeetingDate(event.target.value)}
                className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <Button variant="outline" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
        {slotsLoading ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
            Loading slots for {formatHumanDate(meetingDate)}...
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium text-success shadow-sm">
            {successMessage}
          </div>
        ) : null}

        {(surfaceError ?? slotsError ?? bookingError ?? cancellingError ?? deleteRequestError ?? updateRequestError ?? approveError ?? rejectError) ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive shadow-sm">
            {surfaceError ?? slotsError ?? bookingError ?? cancellingError ?? deleteRequestError ?? updateRequestError ?? approveError ?? rejectError}
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-xl bg-transparent p-0">
            {session.accessType === 'department' ? (
              <TabsTrigger value="department-booking" className="border border-border bg-card px-4 py-2.5 shadow-sm data-[state=active]:border-primary">
                Department Booking
              </TabsTrigger>
            ) : null}
            {session.accessType !== 'department' ? (
              <TabsTrigger value="approval" className="border border-border bg-card px-4 py-2.5 shadow-sm data-[state=active]:border-primary">
                Approval
              </TabsTrigger>
            ) : null}
            {session.accessType === 'jmd' ? (
              <TabsTrigger value="jmd-dashboard" className="border border-border bg-card px-4 py-2.5 shadow-sm data-[state=active]:border-primary">
                JMD Dashboard
              </TabsTrigger>
            ) : null}
            {session.accessType === 'cmd' ? (
              <TabsTrigger value="cmd-dashboard" className="border border-border bg-card px-4 py-2.5 shadow-sm data-[state=active]:border-primary">
                CMD Dashboard
              </TabsTrigger>
            ) : null}
            {session.accessType !== 'department' ? (
              <TabsTrigger value="summary-sheet" className="border border-border bg-card px-4 py-2.5 shadow-sm data-[state=active]:border-primary">
                Summary Sheet
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="department-booking" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
              <Card className="border-border shadow-retool-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl tracking-tight">{editingRequestId ? 'Edit Booking Request' : 'Book Appointment'}</CardTitle>
                  <CardDescription>{editingRequestId ? 'Update the pending request details below and save your changes.' : 'Select a dashboard, click a time card, and send the request into the approval pipeline.'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Input value={session.departmentName ?? ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="booked-by-name">Your Name / Person Name</Label>
                    <Input
                      id="booked-by-name"
                      value={bookingForm.bookedByName}
                      onChange={(event) => setBookingForm((current) => ({ ...current, bookedByName: event.target.value }))}
                      placeholder="Enter attendee name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="meeting-purpose">Purpose of Meeting / Agenda</Label>
                    <Textarea
                      id="meeting-purpose"
                      value={bookingForm.meetingPurpose}
                      onChange={(event) => setBookingForm((current) => ({ ...current, meetingPurpose: event.target.value }))}
                      placeholder="Describe the reason for this meeting"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dashboard-selection">Dashboard</Label>
                    <Select
                      value={bookingForm.executiveRole}
                      onValueChange={(value) => setBookingForm((current) => ({ ...current, executiveRole: value as ExecutiveRole, slotId: '' }))}
                    >
                      <SelectTrigger id="dashboard-selection">
                        <SelectValue placeholder="Choose dashboard" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jmd">JMD Dashboard</SelectItem>
                        <SelectItem value="cmd">CMD Dashboard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-xl border border-border bg-secondary/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="emergency-booking">🚨 Urgent / Emergency Booking</Label>
                        <p className="text-sm text-muted-foreground">
                          Turn this on to request an overwrite of an already booked or pending slot.
                        </p>
                      </div>
                      <Switch
                        id="emergency-booking"
                        checked={bookingForm.isEmergency}
                        onCheckedChange={(checked) => setBookingForm((current) => ({ ...current, isEmergency: checked }))}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <p className="text-sm font-semibold text-foreground">Selected time slot</p>
                    <p className="mt-1 text-sm text-body-foreground">
                      {selectedSlot ? `${EXECUTIVE_SHORT_LABELS[selectedSlot.executiveRole]} • ${selectedSlot.slotId}` : 'Click a time card on the right to select a slot.'}
                    </p>
                    {selectedSlot?.status === 'pending_approval' ? (
                      <p className="mt-2 text-xs font-medium text-warning">Pending Approval</p>
                    ) : null}
                    {selectedSlot && selectedSlot.status !== 'available' && bookingForm.isEmergency ? (
                      <p className="mt-2 text-xs font-medium text-destructive">
                        Emergency submission will request an overwrite of the current slot.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        void handleDepartmentBooking()
                      }}
                      disabled={
                        bookingLoading ||
                        !bookingForm.slotId ||
                        !bookingForm.bookedByName.trim() ||
                        !bookingForm.meetingPurpose.trim() ||
                        slotsLoading
                      }
                    >
                      {bookingLoading ? 'Submitting...' : editingRequestId ? 'Save Changes' : 'Book Appointment'}
                    </Button>
                    {editingRequestId ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingRequestId(null)
                          setBookingForm((current) => ({
                            ...current,
                            slotId: '',
                            bookedByName: '',
                            meetingPurpose: '',
                            isEmergency: false,
                          }))
                        }}
                      >
                        Cancel Edit
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <SlotGrid
                  title={EXECUTIVE_LABELS[bookingForm.executiveRole]}
                  description="Only the selected dashboard is shown here. Available cards are clickable, and pending requests are highlighted in yellow."
                  slots={departmentSlots}
                  selectedSlotId={bookingForm.slotId || null}
                  isEmergency={bookingForm.isEmergency}
                  onSelect={(slot) => {
                    if (!canDepartmentSelectSlot(slot, bookingForm.isEmergency)) {
                      return
                    }

                    setBookingForm((current) => ({ ...current, executiveRole: slot.executiveRole, slotId: slot.slotId }))
                  }}
                  onCancel={() => {
                    // Departments cannot clear slots.
                  }}
                  busyActionId={busyActionId}
                  allowDepartmentSelection={true}
                  allowManagementSelection={false}
                  allowManagementCancel={false}
                  maskPrivateDetails={true}
                />

                <DepartmentRequestsLog
                  requests={departmentRequests}
                  busyRequestId={busyRequestId}
                  onEdit={(request) => {
                    setEditingRequestId(request.requestId)
                    setBookingForm({
                      executiveRole: request.executiveRole,
                      slotId: request.slotId,
                      bookedByName: request.bookedByName,
                      meetingPurpose: request.meetingPurpose,
                      isEmergency: request.isEmergency,
                    })
                  }}
                  onCancel={(request) => {
                    void handleDepartmentCancelRequest(request)
                  }}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="approval" className="space-y-6">
            <ApprovalQueue
              requests={visibleApprovalRequests}
              remarksByRequest={approvalRemarks}
              busyRequestId={busyRequestId}
              onRemarkChange={(requestId, value) => {
                setApprovalRemarks((current) => ({ ...current, [requestId]: value }))
              }}
              onApprove={(request) => {
                void handleApproveRequest(request)
              }}
              onReject={(request) => {
                void handleRejectRequest(request)
              }}
            />
          </TabsContent>

          <TabsContent value="jmd-dashboard" className="space-y-6">
            <SlotGrid
              title="JMD Dashboard"
              description="Click any available card to reserve time directly. Clear an occupied card to reopen it immediately."
              slots={groupedSlots.jmd}
              selectedSlotId={null}
              isEmergency={false}
              onSelect={(slot) => {
                void handleManagementReserve(slot)
              }}
              onCancel={(slot) => {
                void handleManagementClear(slot)
              }}
              busyActionId={busyActionId}
              allowDepartmentSelection={false}
              allowManagementSelection={true}
              allowManagementCancel={true}
              maskPrivateDetails={false}
            />
          </TabsContent>

          <TabsContent value="cmd-dashboard" className="space-y-6">
            <SlotGrid
              title="CMD Dashboard"
              description="Click any available card to reserve time directly. Clear an occupied card to reopen it immediately."
              slots={groupedSlots.cmd}
              selectedSlotId={null}
              isEmergency={false}
              onSelect={(slot) => {
                void handleManagementReserve(slot)
              }}
              onCancel={(slot) => {
                void handleManagementClear(slot)
              }}
              busyActionId={busyActionId}
              allowDepartmentSelection={false}
              allowManagementSelection={true}
              allowManagementCancel={true}
              maskPrivateDetails={false}
            />
          </TabsContent>

          <TabsContent value="summary-sheet" className="space-y-6">
            <SummarySheet rows={summaryRows} />
          </TabsContent>
        </Tabs>

        {bookingForm.isEmergency && session.accessType === 'department' ? (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Emergency requests are shown in red on Approval and can be used to request an overwrite of an existing booking.</p>
          </div>
        ) : null}
      </main>
    </div>
  )
}
