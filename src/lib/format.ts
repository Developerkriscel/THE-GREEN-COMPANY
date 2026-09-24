import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function money(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return inr.format(value)
}

/** Indian short form: 1,25,00,000 -> "1.25 Cr" */
export function moneyShort(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (Math.abs(value) >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`
  if (Math.abs(value) >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)} L`
  if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`
  return inr.format(value)
}

export function num(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null
  const d = typeof value === 'string' ? parseISO(value) : value
  return isValid(d) ? d : null
}

export function date(value: string | Date | null | undefined) {
  const d = toDate(value)
  return d ? format(d, 'dd MMM yyyy') : '—'
}

export function dateTime(value: string | Date | null | undefined) {
  const d = toDate(value)
  return d ? format(d, 'dd MMM yyyy, HH:mm') : '—'
}

export function ago(value: string | Date | null | undefined) {
  const d = toDate(value)
  return d ? `${formatDistanceToNowStrict(d)} ago` : '—'
}

export function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2).replace(/\.00$/, '')}%`
}

/** Never render a full government ID. */
export function maskId(last4: string | null | undefined) {
  if (!last4) return '—'
  return `XXXX XXXX ${last4}`
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function titleCase(value: string | null | undefined) {
  if (!value) return '—'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Build and download a CSV client-side. Exports are scoped by RLS already. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n')

  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}
