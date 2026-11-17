export const FOOD_TYPES = { veg: 'Veg', non_veg: 'Non-veg', vegan: 'Vegan' };
export const CATEGORIES = {
  cooked: 'Cooked meals', packaged: 'Packaged', bakery: 'Bakery', raw: 'Raw ingredients', fruits_veg: 'Fruits and vegetables',
};
export const STATUS = {
  available: 'Available', claimed: 'Claimed', picked_up: 'Collected', expired: 'Expired', cancelled: 'Withdrawn',
  active: 'Collect soon', completed: 'Collected', released: 'Missed', pending: 'In review',
  verified: 'Verified', approved: 'Approved', rejected: 'Not approved', unverified: 'Not verified',
};
export const ROLES = { donor: 'Donor', ngo: 'NGO', volunteer: 'Volunteer', admin: 'Admin' };

export function minutesUntil(date) {
  return Math.round((new Date(date) - Date.now()) / 60000);
}

export function duration(mins) {
  if (mins <= 0) return 'now';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function time(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function dateTime(d) {
  const x = new Date(d);
  const today = new Date();
  const sameDay = x.toDateString() === today.toDateString();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (sameDay) return `Today, ${time(x)}`;
  if (x.toDateString() === y.toDateString()) return `Yesterday, ${time(x)}`;
  return x.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function ago(d) {
  const mins = Math.round((Date.now() - new Date(d)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)} h ago`;
  return dateTime(d);
}

export function km(d) {
  if (d == null) return null;
  return d < 1 ? `${Math.round(d * 1000)} m away` : `${Number(d).toFixed(1)} km away`;
}

export function num(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

/** For <input type="datetime-local">: local time without seconds. */
export function toLocalInput(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
}

export function freshness(expires, prepared) {
  const left = minutesUntil(expires);
  const total = Math.max(1, (new Date(expires) - new Date(prepared)) / 60000);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const level = left <= 60 ? 'hot' : left <= 150 ? 'warm' : 'ok';
  return { left, pct, level };
}
