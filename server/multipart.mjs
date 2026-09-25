/**
 * The file out of a multipart/form-data upload.
 *
 * supabase-js wraps any Blob or File in FormData before posting it -- a
 * `cacheControl` field, an optional `metadata` field, and the file itself --
 * so a browser upload arrives as a multipart envelope, not raw bytes. Stored
 * as-is, the "photo" would be the envelope: boundary lines and part headers
 * around the JPEG, which no browser can display.
 *
 * Returns the first part that carries a filename (the file), with its own
 * Content-Type, or null when there is none.
 */
export function extractFilePart(body, contentTypeHeader) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentTypeHeader ?? ''))
  if (!m) return null
  const delimiter = Buffer.from(`--${(m[1] ?? m[2]).trim()}`)
  const HEADER_END = Buffer.from('\r\n\r\n')

  let pos = body.indexOf(delimiter)
  while (pos !== -1) {
    const partStart = pos + delimiter.length
    // "--" straight after a delimiter closes the envelope.
    if (body[partStart] === 0x2d && body[partStart + 1] === 0x2d) return null

    const next = body.indexOf(delimiter, partStart)
    if (next === -1) return null
    const headEnd = body.indexOf(HEADER_END, partStart)
    if (headEnd === -1 || headEnd > next) return null

    const head = body.subarray(partStart, headEnd).toString('utf8')
    if (/content-disposition:[^\r\n]*filename=/i.test(head)) {
      const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? 'application/octet-stream'
      // The part's bytes end at the CRLF that precedes the next delimiter.
      let end = next
      if (body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2
      return { body: body.subarray(headEnd + HEADER_END.length, end), contentType: type }
    }
    pos = next
  }
  return null
}
