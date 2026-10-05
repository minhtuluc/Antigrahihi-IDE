import path from 'node:path';
export function permittedAssetPath(value: string, root: string): string | undefined {
 try {
  const rawPath = value.replace(/^reader:\/\/app/, '').split(/[?#]/)[0];
  if (decodeURIComponent(rawPath).split(/[\\/]/).some(part => part === '..' || part === '.')) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'reader:' || url.hostname !== 'app' || url.search || url.hash) return undefined;
  const decoded = decodeURIComponent(url.pathname);
  if (decoded.split(/[\\/]/).some(part => part === '..' || part === '.') || decoded.includes('\0')) return undefined;
  const target = path.resolve(root, `.${decoded}`);
  return target.startsWith(`${path.resolve(root)}${path.sep}`) ? target : undefined;
 } catch { return undefined; }
}
export function isReaderSender(sender: string | undefined, entry: string): boolean { return sender === entry; }
