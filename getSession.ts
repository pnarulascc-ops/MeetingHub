import { getSessionFromToken } from './session.ts'

type Params = {
  sessionToken: string
}

export default async function getSession(req: { params: Params; user: User }) {
  const session = await getSessionFromToken(req.params.sessionToken)
  if (!session) {
    return { session: null }
  }

  return { session }
}
