import type { ChatEvent, JoinEvent, Platform } from './types.ts';

/** Who is in each channel, so an overlay that subscribes later can be told straight away. */
export class Presence {
  /** Channel → login → the join event that announced them. */
  readonly #channels = new Map<string, Map<string, JoinEvent>>();

  /** Keeps track of joins and parts; every other event is ignored. */
  apply(event: ChatEvent): void {
    const key = `${event.platform}:${event.channel}`;
    if (event.type === 'join') {
      let members = this.#channels.get(key);
      if (!members) {
        members = new Map();
        this.#channels.set(key, members);
      }
      members.set(event.login, event);
    } else if (event.type === 'part') {
      this.#channels.get(key)?.delete(event.login);
    }
  }

  /** Everyone currently in the channel, as join events ready to send to a new overlay. */
  snapshot(platform: Platform, channel: string): JoinEvent[] {
    return [...(this.#channels.get(`${platform}:${channel}`)?.values() ?? [])];
  }

  /** Called when the connector leaves a channel: its list can no longer be trusted. */
  forget(platform: Platform, channel: string): void {
    this.#channels.delete(`${platform}:${channel}`);
  }
}
