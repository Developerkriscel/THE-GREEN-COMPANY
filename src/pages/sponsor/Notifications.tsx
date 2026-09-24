import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BellOff, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, useToast } from '@/components/ui'
import { SkeletonRows } from '@/components/sponsor'
import { dateTime, num } from '@/lib/format'
import type { Notification } from '@/lib/types'

/**
 * Everything the company has told this member.
 *
 * The header bell only ever showed the most recent few and had nowhere to go;
 * anything older simply fell off the end. This is the full list, and the place
 * a member can actually catch up.
 */
export function SponsorNotifications() {
  const { profile } = useAuth()
  const me = profile?.id
  const qc = useQueryClient()
  const toast = useToast()

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications-page', me],
    enabled: Boolean(me),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      return (data ?? []) as Notification[]
    },
  })

  const unread = items.filter((n) => !n.read_at)

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = unread.map((n) => n.id)
      if (!ids.length) return
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications-page', me] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      toast.push('success', 'All caught up')
    },
    onError: (e: Error) => toast.push('error', e.message),
  })

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications-page', me] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates from the office about your account, payouts and team."
        action={
          unread.length > 0 ? (
            <Button variant="outline" size="sm" loading={markAll.isPending} onClick={() => markAll.mutate()}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title={unread.length ? `${num(unread.length)} unread` : 'All read'}
          subtitle={`${num(items.length)} in total`}
        />
        {isLoading ? (
          <SkeletonRows rows={5} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="Updates about your income, withdrawals and KYC will appear here."
            action={<BellOff className="h-5 w-5 text-slate-300" />}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => {
              const body = (
                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className={`text-sm ${n.read_at ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{dateTime(n.created_at)}</p>
                  </div>
                  {!n.read_at && <Badge tone="blue">New</Badge>}
                </div>
              )
              return (
                <li
                  key={n.id}
                  className="cursor-pointer transition hover:bg-slate-50"
                  onClick={() => !n.read_at && markOne.mutate(n.id)}
                >
                  {n.link ? <Link to={n.link}>{body}</Link> : body}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
