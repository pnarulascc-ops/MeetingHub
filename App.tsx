/** @jsxRuntime automatic */

import { RetoolAuthGate } from './components/RetoolAuthGate'
import { MeetingSchedulerApp } from './components/MeetingSchedulerApp'

export default function App() {
  return (
    <RetoolAuthGate>
      <MeetingSchedulerApp />
    </RetoolAuthGate>
  )
}
