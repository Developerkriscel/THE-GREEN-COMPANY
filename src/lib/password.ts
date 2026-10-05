/**
 * A first password for a new account, e.g. "Rsgc@7kPq2xMz": the company
 * prefix, then 8 random characters from the browser's CSPRNG (no look-alike
 * characters such as 0/O or 1/l), so it can be read out over the phone.
 */
export function newTempPassword(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return 'Rsgc@' + Array.from(bytes, (b) => abc[b % abc.length]).join('')
}
