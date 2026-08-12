'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitPin, type PinState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Checking…' : 'Unlock'}
    </Button>
  )
}

export function PinForm({ next }: { next: string }) {
  const [state, action] = useActionState<PinState, FormData>(submitPin, {})

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Input
        name="pin"
        type="password"
        autoComplete="off"
        autoFocus
        maxLength={32}
        placeholder="PIN or code"
        aria-label="PIN or coach code"
        className="h-14 text-center font-mono text-xl tracking-[0.25em] placeholder:tracking-normal placeholder:text-base"
      />
      {state.error && (
        <p className="text-center text-sm text-rose-500" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  )
}
