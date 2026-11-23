import { ChatClient } from '@twurple/chat';

const channel = process.argv[2];
if (!channel) {
  console.error('Usage: node scratch/emote-spike.ts <channel>');
  process.exit(1);
}

async function probe(label: string, url: string): Promise<void> {
  try {
    const res = await fetch(url);
    const body: unknown = await res.json();
    console.log(`\n===== ${label} (HTTP ${res.status}) =====`);
    console.dir(body, { depth: 5, maxArrayLength: 2 });
  } catch (err) {
    console.log(`\n===== ${label} FAILED =====`, err);
  }
}

const chat = new ChatClient({ channels: [channel] });
let done = false;

chat.onMessage(async (_channel, _user, _text, msg) => {
  if (done) return;
  done = true;
  chat.quit();

  const id = msg.channelId;
  console.log(`[spike] ${channel} has Twitch user ID: ${id}`);
  if (!id) return;

  await probe('BTTV global', 'https://api.betterttv.net/3/cached/emotes/global');
  await probe('BTTV channel', `https://api.betterttv.net/3/cached/users/twitch/${id}`);
  await probe('FFZ channel (via BTTV)', `https://api.betterttv.net/3/cached/frankerfacez/users/twitch/${id}`);
  await probe('7TV global', 'https://7tv.io/v3/emote-sets/global');
  await probe('7TV channel', `https://7tv.io/v3/users/twitch/${id}`);
});

chat.connect();