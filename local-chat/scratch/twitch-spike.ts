import { createTwitchAdapter } from '../src/adapters/twitch/adapter.ts';
import { isKnownBot } from '../src/bots.ts';
import { EmoteCache } from '../src/emotes/cache.ts';

const channel = process.argv[2];
if (!channel) {
  console.error('Usage: node scratch/twitch-spike.ts <channel>');
  process.exit(1);
}

const adapter = createTwitchAdapter({ isKnownBot, emotes: new EmoteCache() });

adapter.onEvent((event) => {
  if (event.type !== 'chat') return;
  const thirdParty = event.parts.filter((p) => p.kind === 'emote' && !p.url.includes('jtvnw'));
  if (thirdParty.length > 0) console.log(event.name, '→', event.parts);
});

process.on('SIGINT', async () => {
  await adapter.stop();
  console.log('[live] stopped cleanly');
  process.exit(0);
});

await adapter.start();
await adapter.join(channel);
console.log(`[live] joined ${channel}`);