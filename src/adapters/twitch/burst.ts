/** At least this many joins arriving together counts as Twitch's existing-viewer burst. */
export const BURST_MIN = 20;
/** "Together" means within this many milliseconds. */
export const BURST_WINDOW_MS = 5_000;

export interface BurstDetectorOptions {
  min?: number;
  windowMs?: number;
}

/** Spots the burst of existing viewers Twitch sometimes sends after joining. */
export class BurstDetector {
  readonly #min: number;
  readonly #windowMs: number;
  /** Arrival times of recent joins, oldest first. */
  readonly #times: number[] = [];
  #seen = false;

  constructor(options: BurstDetectorOptions = {}) {
    this.#min = options.min ?? BURST_MIN;
    this.#windowMs = options.windowMs ?? BURST_WINDOW_MS;
  }

  /** Whether a burst has been recognised yet. */
  get seen(): boolean {
    return this.#seen;
  }

  /** Records one join at `now`. Returns true only at the moment a burst is first recognised. */
  record(now: number): boolean {
    if (this.#seen) return false;
    this.#times.push(now);

    let oldest = this.#times[0];
    while (oldest !== undefined && now - oldest > this.#windowMs) {
      this.#times.shift();
      oldest = this.#times[0];
    }

    if (this.#times.length < this.#min) return false;
    this.#seen = true;
    this.#times.length = 0; // no longer needed
    return true;
  }
}
