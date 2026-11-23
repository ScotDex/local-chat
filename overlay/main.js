// @ts-check
import { parseSettings } from './core/settings.js';
import { ChatStore } from './core/store.js';
import { startConnection } from './core/connection.js';
import { renderMessage, renderSystemLine } from './skins/eve/render.js';

/** @typedef {import('./core/connection.js').ChannelRef} ChannelRef */
/** @typedef {import('../src/types.ts').ChatMessage} ChatMessage */

// While developing, the connector serves this page itself, so it is the same origin.
// Before deploying to the overlay's own domain, this must point at the connector.
const CONNECTOR_URL = location.origin;
const SOCKET_IO_CLIENT = '/socket.io/socket.io.esm.min.js';

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in the page`);
  return found;
}

const settings = parseSettings(location.search);
const root = document.documentElement;
const windowEl = byId('window');
const listEl = byId('list');

// ---------- Apply settings ----------
if (settings.fontSize)
  root.style.setProperty('--font-size', `${settings.fontSize}px`);
if (settings.rosterWidth)
  root.style.setProperty('--roster-w', `${settings.rosterWidth}px`);
if (settings.portraitSize)
  root.style.setProperty('--portrait', `${settings.portraitSize}px`);
if (settings.opacity !== null)
  root.style.setProperty('--panel-opacity', String(settings.opacity));
if (settings.theme) root.dataset.theme = settings.theme;
if (settings.previewBackground) document.body.classList.add('preview-bg');
if (settings.legacyWidth) {
  root.style.setProperty(
    '--panel-w',
    `min(${settings.legacyWidth}px, calc(100vw - 48px))`,
  );
}
if (settings.legacyMaxHeight) {
  root.style.setProperty(
    '--panel-max-h',
    `min(${settings.legacyMaxHeight}px, calc(100vh - 48px))`,
  );
}
if (settings.legacyWidth || settings.legacyMaxHeight)
  windowEl.classList.add('fixed-size');
if (!settings.roster) {
  byId('rosterCol').style.display = 'none';
  windowEl.classList.add('no-roster');
}
if (!settings.portraits) windowEl.classList.add('no-portrait');
windowEl.classList.add('active');

const store = new ChatStore({
  maxMessages: settings.maxMessages,
  showBots: settings.showBots,
  hiddenNames: settings.hiddenNames,
});

/** @type {Map<string, HTMLElement>} */
const rows = new Map();

/** @param {ChatMessage} m */
const keyOf = (m) => `${m.platform}:${m.channel}:${m.id}`;

/** Drop rows from the top while the list overflows its window, as the previous overlay did. */
function trimToFit() {
  while (
    listEl.children.length > 1 &&
    listEl.scrollHeight > listEl.clientHeight
  ) {
    listEl.firstElementChild?.remove();
    listEl.classList.add('overflowing');
  }
}

/** Make the screen match the store: remove deleted rows, append new ones. */
function syncList() {
  const current = new Set(store.messages.map(keyOf));
  for (const [key, row] of rows) {
    if (!current.has(key)) {
      row.remove();
      rows.delete(key);
    }
  }
  for (const message of store.messages) {
    const key = keyOf(message);
    if (!rows.has(key)) {
      const row = renderMessage(message);
      rows.set(key, row);
      listEl.append(row);
    }
  }
  trimToFit();
}

/** @param {string} text */
function systemLine(text) {
  listEl.append(renderSystemLine(text));
  trimToFit();
}

// ---------- Connect ----------
/** @type {ChannelRef[]} */
const channels = [];
if (settings.twitch)
  channels.push({ platform: 'twitch', channel: settings.twitch });

if (channels.length === 0) {
  systemLine('No channel set. Add ?channel=yourname to the URL.');
} else {
  const { io } = await import(SOCKET_IO_CLIENT);
  const socket = io(CONNECTOR_URL, {
    transports: ['websocket'],
    autoConnect: false,
  });

  startConnection({
    socket,
    channels,
    onEvent: (event) => {
      if (store.apply(event)) syncList();
    },
    onStatus: (live) => {
      byId('statusDot').classList.toggle('live', live);
      if (live)
        for (const ref of channels)
          systemLine(`Channel changed to Local : ${ref.channel}`);
    },
    onError: (message) => systemLine(message),
  });
}
