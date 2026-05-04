/** Client-side names when `POST /api/powervibe/suggest-app-name` fails (offline, proxy, etc.). */

export const POWERVIBE_APP_NAME_CLIENT_FALLBACKS = [
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

export function pickPowervibeAppNameClientFallback(): string {
  const i = Math.floor(Math.random() * POWERVIBE_APP_NAME_CLIENT_FALLBACKS.length);
  return POWERVIBE_APP_NAME_CLIENT_FALLBACKS[i]!;
}
