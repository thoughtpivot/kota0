/** Client-side names when `POST /api/kota0/suggest-app-name` fails (offline, proxy, etc.). */

export const K0_APP_NAME_CLIENT_FALLBACKS = [
  "Lemon Giraffe",
  "Sock Meteor",
  "Quiet Waffle",
  "Turbo Snail",
  "Misty Pickle",
  "Jelly Moonbeam",
  "Cosmic Marshmallow",
  "Wobbly Telescope",
  "Brave Pancake",
  "Pocket Zeppelin",
  "Doodle Badger",
  "Giggly Glacier",
] as const;

export function pickKota0AppNameClientFallback(): string {
  const i = Math.floor(Math.random() * K0_APP_NAME_CLIENT_FALLBACKS.length);
  return K0_APP_NAME_CLIENT_FALLBACKS[i]!;
}
