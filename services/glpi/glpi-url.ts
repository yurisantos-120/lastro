// HTTP exceptions are pinned to one canonical IPv4 address. The general
// exception explicitly opts into unencrypted transport, including public IPs.
function ipv4Parts(value: string): number[] | undefined {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return undefined;
  const parts = value.split('.').map(Number);
  return parts.some((part) => part > 255) ? undefined : parts;
}

export function privateGlpiHost(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  const parts = ipv4Parts(value);
  if (!parts || !(
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )) throw new Error('Invalid private GLPI host');
  return value;
}

export function glpiHttpHost(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  const parts = ipv4Parts(value);
  if (!parts || parts[0] === 0 || parts[0] === 127 || parts[0] >= 224 ||
    (parts[0] === 169 && parts[1] === 254))
    throw new Error('Invalid GLPI HTTP host');
  return value;
}

export function glpiTransportUrl(value: string, pinnedPrivateHost?: string, pinnedHttpHost?: string): string {
  const privateHost = privateGlpiHost(pinnedPrivateHost);
  const httpHost = glpiHttpHost(pinnedHttpHost);
  if (privateHost && httpHost) throw new Error('Conflicting GLPI HTTP hosts');
  if (value.includes('\\')) throw new Error('Invalid GLPI transport');
  const url = new URL(value);
  if (
    !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === (privateHost ?? httpHost))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/\/apirest\.php\/?$/i.test(url.pathname) ||
    /\/api\.php(?:\/|$)/i.test(url.pathname)
  )
    throw new Error('Invalid GLPI transport');
  return url.href.replace(/\/+$/, '');
}

export function glpiHttpsUrl(value: string): string {
  return glpiTransportUrl(value);
}
