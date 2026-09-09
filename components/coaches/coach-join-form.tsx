'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { startCoachJoin, type JoinState } from '@/lib/actions/coach-join'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full bg-[#5865F2] text-white hover:opacity-90" disabled={pending}>
      {pending ? 'Opening Discord…' : 'Continue with Discord'}
    </Button>
  )
}

export function CoachJoinForm() {
  const [state, action] = useActionState<JoinState, FormData>(startCoachJoin, {})

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cj-name">Your name</Label>
        <Input id="cj-name" name="name" autoComplete="name" maxLength={60} placeholder="Alex Rivera" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cj-promo">Your promo code</Label>
        <Input
          id="cj-promo"
          name="promoCode"
          maxLength={20}
          placeholder="ALEX100"
          className="font-mono uppercase tracking-[0.1em] placeholder:tracking-normal"
        />
        <p className="text-xs text-muted-foreground">
          This is the code your buyers type to credit you. Letters and numbers only.
        </p>
      </div>
      {state.error && (
        <p className="rounded-md bg-rose-100 px-3 py-2 text-center text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  )
}
