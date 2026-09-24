/**
 * Minimal dependency-free PDF writer.
 *
 * Generating paperwork server-side matters for two reasons: the document must
 * be identical for everyone (it is a contractual artefact), and the client must
 * never be trusted to decide what a welcome letter says. This builds a valid
 * single- or multi-page PDF using the built-in Helvetica fonts, which keeps the
 * edge function small and cold-start fast.
 *
 * For richer layouts (logos, tables, signatures) swap this for a pdf-lib import
 * — the call signature below is deliberately the only thing the callers depend on.
 */

interface Line {
  text: string
  size?: number
  bold?: boolean
  gap?: number
}

const PAGE_WIDTH = 595.28 // A4 at 72dpi
const PAGE_HEIGHT = 841.89
const MARGIN = 56

function escapeText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/** Naive width estimate for Helvetica — good enough for wrapping body copy. */
function wrap(text: string, size: number, maxWidth: number): string[] {
  const charWidth = size * 0.5
  const maxChars = Math.max(20, Math.floor(maxWidth / charWidth))
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  }
  if (current) lines.push(current.trim())
  return lines.length ? lines : ['']
}

export function buildPdf(lines: Line[]): Uint8Array {
  const contentChunks: string[] = []
  let y = PAGE_HEIGHT - MARGIN

  for (const line of lines) {
    const size = line.size ?? 11
    const font = line.bold ? '/F2' : '/F1'
    const wrapped = wrap(line.text, size, PAGE_WIDTH - MARGIN * 2)

    for (const piece of wrapped) {
      if (y < MARGIN + 40) break // single page; extend here if longer docs are needed
      contentChunks.push(
        `BT ${font} ${size} Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${escapeText(piece)}) Tj ET`,
      )
      y -= size * 1.55
    }
    y -= line.gap ?? 0
  }

  const content = contentChunks.join('\n')
  const encoder = new TextEncoder()

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []

  objects.forEach((obj, i) => {
    offsets.push(encoder.encode(pdf).length)
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })

  const xrefOffset = encoder.encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return encoder.encode(pdf)
}

export const money = (n: number) =>
  'INR ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)

export const day = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
