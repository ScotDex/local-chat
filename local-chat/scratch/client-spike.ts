import { io } from 'socket.io-client';

const channel = process.argv[2] ?? 'ohnepixel';
const socket = io('http://localhost:3000', { transports: ['websocket'] });

socket.on('connect', async () => {
  const reply = await socket.emitWithAck('subscribe', { platform: 'twitch', channel });
  console.log('[client] subscribe:', reply);
});

socket.on('chat-event', (event) => {
  console.log(`${event.name}: ${event.text}`);
});