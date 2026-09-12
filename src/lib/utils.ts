import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const PK_TZ = 'Asia/Karachi';

export function formatDateTime(value: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: PK_TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  }).format(date);
}

export function formatDate(value: Date | string): string {
  return formatDateTime(value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: undefined,
    minute: undefined,
  });
}

export function formatTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: PK_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** "2 din pehle", "abhi" — Roman Urdu relative time. */
export function formatRelative(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const seconds = Math.abs(diffMs) / 1000;

  if (seconds < 45) return future ? 'abhi' : 'abhi abhi';
  const units: Array<[number, string]> = [
    [60, 'minute'],
    [3600, 'ghanta'],
    [86_400, 'din'],
    [604_800, 'hafta'],
    [2_592_000, 'mahina'],
  ];
  let amount = Math.round(seconds / 60);
  let unit = 'minute';
  for (let i = 0; i < units.length; i += 1) {
    const [threshold, name] = units[i]!;
    if (seconds < threshold * 60 || i === units.length - 1) {
      amount = Math.max(1, Math.round(seconds / threshold));
      unit = name;
      break;
    }
  }
  const plural = amount === 1 ? unit : `${unit}${unit.endsWith('a') ? 'y' : 's'}`;
  return future ? `${amount} ${plural} mein` : `${amount} ${plural} pehle`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Mask a phone number for display to parties who should not see it in full. */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '••••';
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function minutesToTimeLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Haversine distance in kilometres. */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
