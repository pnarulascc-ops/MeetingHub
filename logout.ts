import { deleteSession } from './session.ts'

type Params = {
  sessionToken: string
}

export default async function logout(req: { params: Params; user: User }) {
  await deleteSession(req.params.sessionToken)
  return { success: true }
}
