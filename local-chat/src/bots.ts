const KNOWN_BOTS = [
  'nightbot',
  'streamelements',
  'streamlabs',
  'moobot',
  'fossabot',
  'wizebot',
  'sery_bot',
  'soundalerts',
  'kofistreambot',
  'botrixoficial',
];

export function createBotMatcher(
  names: Iterable<string>,
): (name: string) => boolean {
  const known = new Set(Array.from(names, (name) => name.toLowerCase()));
  return (name) => known.has(name.toLowerCase());
}

export const isKnownBot = createBotMatcher(KNOWN_BOTS);
