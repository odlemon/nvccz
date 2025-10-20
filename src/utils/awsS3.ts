// @ts-nocheck
// Temporarily disabled S3 uploads. Kept for backward compatibility.
export async function uploadToS3(_buffer: Buffer, _key: string, _mimetype: string): Promise<string> {
  return 'inline_upload';
}