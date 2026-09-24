import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { config } from './config.mjs'

export const s3 = new S3Client({
  region: 'auto',
  endpoint: config.r2Endpoint,
  credentials: {
    accessKeyId: config.r2AccessKeyId,
    secretAccessKey: config.r2SecretAccessKey,
  },
})

export const R2_BUCKET = config.r2Bucket

export async function r2Put(key, body, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export async function r2Get(key) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  const chunks = []
  for await (const chunk of resp.Body) chunks.push(chunk)
  return {
    body: Buffer.concat(chunks),
    contentType: resp.ContentType ?? 'application/octet-stream',
  }
}

export async function r2Exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}
