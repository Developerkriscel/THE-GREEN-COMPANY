import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCheck, Plus, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useMarkThreadRead, useMessages, useThreads, useUnreadThreads } from '@/lib/queries'
import {
  Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner,
  Textarea, useToast,
} from '@/components/ui'
import { ago, dateTime, initials, titleCase } from '@/lib/format'

/**
 * Threaded inbox. Thread visibility is decided by RLS: a rep sees only threads
 * they participate in, a customer only their own, an admin all.
 */
export function MessagesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin, isStaff, isCustomer } = useAuth()
  const location = useLocation()
  const [status, setStatus] = useState('open')
  const { data: unread = [] } = useUnreadThreads()
  const markRead = useMarkThreadRead()
  const unreadFor = new Map(unread.map((u) => [u.thread_id, u.unread]))
  const { data: threads = [], isLoading } = useThreads({ status: status || undefined })
  const { data: messages = [] } = useMessages(id)
  const qc = useQueryClient()
  const { push } = useToast()
  const [internal, setInternal] = useState(false)
  const [composing, setComposing] = useState(false)
  const [subject, setSubject] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // The area decides the view, not the role. A network member signs in as
  // `rep`, so role alone would render the STAFF inbox — internal notes, thread
  // assignment and every other conversation — inside the Sponsor Panel.
  const inSponsorArea = location.pathname.startsWith('/sponsor')
  const base = inSponsorArea ? '/sponsor' : isAdmin ? '/admin' : '/sponsor'
  const staffView = isStaff && !inSponsorArea
  const active = threads.find((t) => t.id === id)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Opening a conversation reads it. Keyed on the message count as well as the
  // id, so a reply that lands while the thread is open is marked read too
  // rather than leaving a badge on the thread the person is looking at.
  useEffect(() => {
    if (!id || messages.length === 0) return
    markRead.mutate(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, messages.length])

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from('messages')
        .insert({ thread_id: id, sender_id: profile?.id, body, internal })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messages', id] })
      void qc.invalidateQueries({ queryKey: ['threads'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  /**
   * A member had no way to raise anything: threads only ever arrived from the
   * public enquiry form. The RPC creates the thread, adds the author as a
   * participant (without which they cannot read their own thread back) and
   * posts the opening message, in one transaction.
   */
  const startThread = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('start_support_thread', {
        p_subject: subject,
        p_body: firstMessage,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: (newId) => {
      void qc.invalidateQueries({ queryKey: ['threads'] })
      setComposing(false)
      setSubject('')
      setFirstMessage('')
      push('success', 'Message sent to the office')
      navigate(`${base}/messages/${newId}`)
    },
    onError: (e: Error) => push('error', e.message),
  })

  const resolve = useMutation({
    mutationFn: async (next: 'open' | 'resolved') => {
      const { error } = await supabase.from('message_threads').update({ status: next }).eq('id', id!)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      push('success', 'Thread updated.')
      void qc.invalidateQueries({ queryKey: ['threads'] })
    },
    onError: (e: Error) => push('error', e.message),
  })

  function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const body = String(new FormData(form).get('body') ?? '').trim()
    if (!body) return
    send.mutate(body, { onSuccess: () => form.reset() })
  }

  return (
    <>
      <PageHeader
        title={staffView ? 'Inbox' : 'Support'}
        description={staffView ? 'Website enquiries, customer support and internal notes.' : 'Your conversations with the Royal Green team.'}
        action={
          staffView ? null : (
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4" /> New message
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit max-h-[70vh] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 p-3">
            <Select className="h-8 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All threads</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </Select>
          </div>

          <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {isLoading ? (
              <Spinner />
            ) : threads.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                {staffView ? 'No threads.' : 'No messages yet. Use “New message” to ask the office anything.'}
              </p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`${base}/messages/${t.id}`)}
                  className={clsx(
                    'block w-full px-4 py-3 text-left transition hover:bg-slate-50',
                    t.id === id && 'bg-brand-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={clsx(
                      'line-clamp-1 text-sm text-slate-900',
                      unreadFor.get(t.id) ? 'font-bold' : 'font-medium',
                    )}>
                      {t.subject || 'Conversation'}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {unreadFor.get(t.id) ? (
                        <span
                          className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                          title={`${unreadFor.get(t.id)} unread`}
                        >
                          {unreadFor.get(t.id)}
                        </span>
                      ) : null}
                      <Badge tone={t.status === 'open' ? 'amber' : 'green'}>{t.status}</Badge>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {titleCase(t.kind)} · {ago(t.last_message_at)}
                  </p>
                  {t.guest_name && <p className="text-xs text-slate-400">{t.guest_name} · {t.guest_phone}</p>}
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="flex min-h-[60vh] flex-col">
          {!id ? (
            <EmptyState title="Select a conversation" description="Pick a thread on the left to read and reply." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{active?.subject || 'Conversation'}</p>
                  <p className="text-xs text-slate-500">
                    {active ? `${titleCase(active.kind)} · started ${dateTime(active.created_at)}` : ''}
                  </p>
                </div>
                {staffView && active && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={resolve.isPending}
                    onClick={() => resolve.mutate(active.status === 'open' ? 'resolved' : 'open')}
                  >
                    <CheckCheck className="h-4 w-4" />
                    {active.status === 'open' ? 'Mark resolved' : 'Reopen'}
                  </Button>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {messages.length === 0 && (
                  <p className="py-10 text-center text-sm text-slate-500">No messages in this thread yet.</p>
                )}
                {messages.map((m) => {
                  const mine = m.sender_id === profile?.id
                  return (
                    <div key={m.id} className={clsx('flex gap-2', mine && 'flex-row-reverse')}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                        {initials(m.sender?.full_name ?? 'Guest')}
                      </span>
                      <div
                        className={clsx(
                          'max-w-[75%] rounded-xl px-3 py-2 text-sm',
                          m.internal
                            ? 'border border-amber-200 bg-amber-50 text-amber-900'
                            : mine
                              ? 'bg-brand-700 text-white'
                              : 'bg-slate-100 text-slate-800',
                        )}
                      >
                        {m.internal && (
                          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            Internal note — not visible to the customer
                          </p>
                        )}
                        <p className="whitespace-pre-line">{m.body}</p>
                        <p className={clsx('mt-1 text-[10px]', mine && !m.internal ? 'text-brand-100' : 'text-slate-500')}>
                          {m.sender?.full_name ?? 'Guest'} · {ago(m.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={onSend} className="border-t border-slate-200 p-3">
                {staffView && (
                  <Checkbox
                    className="mb-2"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                    label={<span className="text-xs">Internal note (staff only)</span>}
                  />
                )}
                <div className="flex gap-2">
                  <Input name="body" placeholder="Write a reply…" autoComplete="off" />
                  <Button type="submit" loading={send.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>

      {/* Members raise their own support requests here. */}
      <Modal
        open={composing}
        onClose={() => setComposing(false)}
        title="Message the office"
        footer={
          <>
            <Button variant="outline" onClick={() => setComposing(false)}>Cancel</Button>
            <Button
              loading={startThread.isPending}
              disabled={!subject.trim() || !firstMessage.trim()}
              onClick={() => startThread.mutate()}
            >
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Subject" required>
            <Input
              value={subject}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Question about my withdrawal"
            />
          </Field>
          <Field label="Message" required>
            <Textarea
              rows={5}
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="Tell the office what you need help with…"
            />
          </Field>
          <p className="text-xs text-slate-500">
            The office replies in this thread. You will see the reply here and in your notifications.
          </p>
        </div>
      </Modal>
    </>
  )
}
