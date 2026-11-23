// @ts-check
import { toSegments } from '../../core/text.js';

/** @typedef {import('../../../src/types.ts').ChatMessage} ChatMessage */

/**
 * @param {ChatMessage} message
 * @returns {HTMLLIElement}
 */
export function renderMessage(message) {
  const row = document.createElement('li');
  row.className = 'row';

  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = message.name;
  if (message.color) who.style.color = message.color;

  const text = document.createElement('span');
  text.className = 'text';
  for (const segment of toSegments(message.parts)) {
    if (segment.kind === 'emote') {
      const img = document.createElement('img');
      img.className = 'emote';
      img.alt = segment.name;
      img.src = segment.url;
      text.append(img);
    } else if (segment.kind === 'link') {
      const span = document.createElement('span');
      span.className = 'link';
      span.textContent = segment.text;
      text.append(span);
    } else {
      text.append(segment.text);
    }
  }

  row.append(who, text);
  return row;
}

/**
 * A red EVE System line with a UTC timestamp, as in the previous overlay.
 * @param {string} text
 * @returns {HTMLLIElement}
 */
export function renderSystemLine(text) {
  const row = document.createElement('li');
  row.className = 'row system';

  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = `[${new Date().toISOString().slice(11, 19)}] EVE System`;

  const body = document.createElement('span');
  body.className = 'text';
  body.textContent = text;

  row.append(who, body);
  return row;
}
