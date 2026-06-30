import { createSessionFromAccessCode } from './session.ts'

type Params = {
  accessCode: string
  loginAs?: 'department' | 'jmd' | 'cmd'
}

export default async function login(req: { params: Params; user: User }) {
  const session = await createSessionFromAccessCode(req.params.accessCode, req.params.loginAs)
  if (!session) {
    throw new Error('Invalid access code.')
  }

  return session
}
