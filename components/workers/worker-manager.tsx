'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  createWorker,
  setWorkerActive,
  setWorkerRole,
  generateWorkerCode,
} from '@/lib/actions/workers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function AddWorkerDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'manager' | 'worker'>('worker')

  function submit() {
    if (!name.trim()) return toast.error('Name is required')
    startTransition(async () => {
      try {
        await createWorker({ displayName: name, email: email || null, role })
        toast.success('Worker added')
        setOpen(false)
        setName('')
        setEmail('')
        router.refresh()
      } catch {
        toast.error('Could not add worker')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Add worker</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New worker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="w-name">Name *</Label>
            <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-email">Email</Label>
            <Input id="w-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole((v ?? 'worker') as 'admin' | 'manager' | 'worker')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="worker">Worker</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Adding…' : 'Add worker'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function WorkerRowActions({
  id,
  active,
  role,
  isLocalAdmin,
}: {
  id: string
  active: boolean
  role: string
  isLocalAdmin: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [code, setCode] = useState<string | null>(null)

  function toggleActive() {
    startTransition(async () => {
      try {
        await setWorkerActive(id, !active)
        router.refresh()
      } catch {
        toast.error('Could not update')
      }
    })
  }
  function changeRole(next: string | null) {
    if (!next || next === role) return
    startTransition(async () => {
      try {
        await setWorkerRole(id, next as 'admin' | 'manager' | 'worker')
        router.refresh()
      } catch {
        toast.error('Could not update role')
      }
    })
  }
  function rotate() {
    startTransition(async () => {
      try {
        setCode(await generateWorkerCode(id))
        router.refresh()
      } catch {
        toast.error('Could not generate code')
      }
    })
  }

  if (isLocalAdmin) {
    return <span className="text-xs text-muted-foreground">system admin</span>
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Select value={role} onValueChange={changeRole} disabled={pending}>
        <SelectTrigger className="h-8 w-[104px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="worker">worker</SelectItem>
          <SelectItem value="manager">manager</SelectItem>
          <SelectItem value="admin">admin</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={rotate} disabled={pending}>
        Login code
      </Button>
      <Button size="sm" variant="ghost" onClick={toggleActive} disabled={pending}>
        {active ? 'Disable' : 'Enable'}
      </Button>

      <Dialog open={code != null} onOpenChange={(o) => !o && setCode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login code</DialogTitle>
            <DialogDescription>
              Give this to the worker — shown once, stored only as a hash. They sign in with it at
              the login screen. Rotate to replace it.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted px-4 py-3 text-center font-mono text-xl tracking-[0.25em]">
            {code}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
