import type { ReactNode } from 'react'
import { BRAND } from '@/lib/brand'

/**
 * The building blocks of a printed identity card, shared by the member's
 * card (Sponsor panel) and the employee card (Admin -> Employees): a CR80
 * face (54 x 85.6 mm, portrait), its security linework, a Code 39 barcode,
 * the seal, and the PDF / print output.
 */

/* The logo's colours, from the site palette (src/index.css): the leaf green
   for the bands, the coin gold for trim and seal, the orange leaf for the
   designation. */
export const C = (k: string, a?: number) => `rgb(var(--c-${k})${a !== undefined ? ` / ${a}` : ''})`
export const DEEP = C('darker')
export const LEAF = C('leaf-dark')
export const GOLD = C('gold')
export const GOLD_LIGHT = C('gold-light')
export const ORANGE = C('orange')
/** The QR and barcode libraries need a literal colour: the palette's darkest green. */
export const INK = '#141f0a'

/** Card size on screen; print uses millimetres (see the print rules below). */
export const W = 300
export const H = Math.round((W * 85.6) / 54)

/**
 * A PDF at true card size (54 × 85.6 mm), one page per face, front then
 * back: the format card printers take. Each face is captured at about
 * 700 dpi. The libraries load only when someone asks for a PDF.
 */
export async function saveIdCardPdf(faces: HTMLElement[], code: string, fileLabel = 'ID-Card') {
  const [images, { jsPDF }] = await Promise.all([captureIdCardFaces(faces), import('jspdf')])
  const pdf = new jsPDF({ unit: 'mm', format: [54, 85.6], orientation: 'portrait', compress: true })
  images.forEach((png, i) => {
    if (i > 0) pdf.addPage([54, 85.6], 'portrait')
    pdf.addImage(png, 'PNG', 0, 0, 54, 85.6, undefined, 'FAST')
  })
  pdf.setProperties({ title: `${BRAND.name} ID card ${code}`, author: BRAND.legalName })
  pdf.save(`${fileSafe(BRAND.short)}-${fileLabel}-${code}.pdf`)
}

/** Each face as a PNG data URL, rendered at 5x (about 700 dpi at card size). */
export async function captureIdCardFaces(faces: HTMLElement[]) {
  const { default: html2canvas } = await import('html2canvas-pro')
  const out: string[] = []
  for (const face of faces) {
    const canvas = await html2canvas(face, {
      scale: 5,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      onclone: (doc) => doc.querySelectorAll<HTMLElement>('.id-face').forEach((f) => { f.style.boxShadow = 'none' }),
    })
    out.push(canvas.toDataURL('image/png'))
  }
  return out
}

/**
 * Every face on an A4 sheet at true size, three across and three down, in
 * the order given (front, back, front, back...), with light cut marks: for
 * an office printer, then cut and laminate back to back.
 */
export async function saveIdCardSheetPdf(faces: HTMLElement[], fileName: string) {
  const [images, { jsPDF }] = await Promise.all([captureIdCardFaces(faces), import('jspdf')])
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const cols = 3, rows = 3, cw = 54, ch = 85.6, gx = 8, gy = 6
  const left = (210 - (cols * cw + (cols - 1) * gx)) / 2
  const top = (297 - (rows * ch + (rows - 1) * gy)) / 2
  images.forEach((png, i) => {
    const slot = i % (cols * rows)
    if (i > 0 && slot === 0) pdf.addPage('a4', 'portrait')
    const x = left + (slot % cols) * (cw + gx)
    const y = top + Math.floor(slot / cols) * (ch + gy)
    pdf.addImage(png, 'PNG', x, y, cw, ch, undefined, 'FAST')
    pdf.setDrawColor(180)
    pdf.setLineWidth(0.1)
    pdf.rect(x, y, cw, ch)
  })
  pdf.setProperties({ title: `${BRAND.name} ID cards`, author: BRAND.legalName })
  pdf.save(`${fileSafe(fileName)}.pdf`)
}

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Print only the card faces on the page (`.id-print-area`): everything else
 * is hidden for the length of the print dialog. The page must render
 * PRINT_CSS.
 */
export function printIdCards() {
  document.body.classList.add('printing-id-card')
  const done = () => {
    document.body.classList.remove('printing-id-card')
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

export function CardFace({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="id-face-wrap m-0 text-center">
      <div
        className="id-face relative overflow-hidden rounded-[14px] bg-white text-left shadow-[0_10px_30px_-10px_rgba(15,81,50,0.45)] ring-1 ring-black/10"
        style={{ width: W, height: H }}
      >
        {children}
      </div>
      <figcaption className="mt-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 print:hidden">{label}</figcaption>
    </figure>
  )
}

export function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[62px_8px_1fr] items-baseline">
      <dt className="font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
      <span className="text-slate-400">:</span>
      <dd className="m-0 font-medium text-slate-900">{children}</dd>
    </div>
  )
}

/*
 * Code 39 barcode of the member ID, as printed on most staff and member
 * cards; any handheld scanner reads it. Each character is five bars and four
 * spaces, three of them wide; `*` marks the start and the end.
 */
const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn',
  F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn',
  P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '*': 'nwnnwnwnn',
}

export function code39Bars(value: string, narrow = 1, wide = 2.5) {
  const chars = `*${value.toUpperCase().replace(/[^0-9A-Z-]/g, '')}*`.split('')
  const bars: { x: number; w: number }[] = []
  let x = 0
  chars.forEach((ch, ci) => {
    CODE39[ch].split('').forEach((e, i) => {
      const w = e === 'w' ? wide : narrow
      if (i % 2 === 0) bars.push({ x, w })
      x += w
    })
    if (ci < chars.length - 1) x += narrow // gap between characters
  })
  return { bars, width: x }
}

export function Code39({ value, height }: { value: string; height: number }) {
  const { bars, width } = code39Bars(value)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={Math.min(150, width * 0.95)} height={height} preserveAspectRatio="none" aria-label={`Barcode ${value}`}>
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={height} fill={INK} />)}
    </svg>
  )
}

/** Fine security-print linework in the background, as on printed cards. */
export function Guilloche() {
  return (
    <>
      <GuillocheLines />
      <img src={BRAND.markSquare} alt="" aria-hidden className="pointer-events-none absolute z-0 h-[140px] w-[140px] object-contain opacity-[0.06]"
        style={{ left: W / 2 - 70, top: H / 2 - 20 }} />
    </>
  )
}

function GuillocheLines() {
  const paths = Array.from({ length: 14 }, (_, i) => {
    const y = 40 + i * 32
    return `M -20 ${y} C 60 ${y - 40}, 120 ${y + 40}, 200 ${y} S 340 ${y - 40}, 420 ${y}`
  })
  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={LEAF} strokeOpacity={0.07} strokeWidth={0.8} />
      ))}
    </svg>
  )
}

export function VerifiedSeal({ lines = ['KYC', 'Verified'], title = 'KYC verified' }: { lines?: [string, string]; title?: string }) {
  return (
    <div
      className="absolute bottom-[-6px] left-1/2 ml-[34px] flex h-[34px] w-[34px] items-center justify-center rounded-full text-center text-[5.5px] font-extrabold uppercase leading-[1.05] text-white"
      style={{ background: `radial-gradient(circle at 35% 30%, ${GOLD_LIGHT}, ${GOLD} 55%, ${C('gold-dark')})`, boxShadow: '0 1px 3px rgba(0,0,0,.35)' }}
      title={title}
    >
      {lines[0]}<br />{lines[1]}
    </div>
  )
}

/**
 * Print: both faces at true CR80 size, side by side, nothing else. Scoped to
 * body.printing-id-card so printing any other page is unaffected.
 */
export const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  body.printing-id-card * { visibility: hidden !important; }
  body.printing-id-card .id-print-area,
  body.printing-id-card .id-print-area * { visibility: visible !important; }
  body.printing-id-card .id-print-area {
    position: fixed; left: 0; top: 0; display: flex !important; gap: 8mm !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  body.printing-id-card .id-face {
    zoom: ${(54 / 25.4 * 96 / W).toFixed(4)};
    box-shadow: none !important; border: 0.2mm solid #999;
  }
  body.printing-id-card figcaption,
  body.printing-id-card .id-print-skip { display: none !important; }
  body.printing-id-card .id-face-wrap { break-inside: avoid; page-break-inside: avoid; }
}
`
