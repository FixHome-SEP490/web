// src/services/call-tones.ts

/**
 * The sounds of a call, made with Web Audio so there is no file to load: the
 * caller hears a ringback once the other phone rings, the callee hears a
 * ringtone (and feels it, on a phone), and a short tone marks a call that
 * failed or ended.
 *
 * Browsers only let a page make sound after the user has touched it, so the
 * audio context is created on the first tap or key press (`prime`). Until then
 * a ringtone is silent but the call screen and the vibration still show it.
 */

/** One step of a pattern: the frequencies sounding together (none = silence) and for how long. */
type Step = [frequencies: number[], ms: number];

/** Vietnam's ringback: 425 Hz, one second on, four off. */
const RINGBACK: Step[] = [[[425], 1000], [[], 4000]];
/** Two short two-note bursts, then a pause. */
const RINGTONE: Step[] = [[[784, 988], 350], [[], 150], [[784, 988], 350], [[], 1600]];
/** Three short beeps: busy, refused, could not connect. */
const FAILED: Step[] = [[[425], 300], [[], 250], [[425], 300], [[], 250], [[425], 300]];
/** A falling two-note close. */
const ENDED: Step[] = [[[620], 180], [[], 100], [[480], 260]];

const VOLUME = 0.08;
const VIBRATE: number[] = [400, 200, 400, 1500];

class CallTones {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sounding: OscillatorNode[] = [];
  private primed = false;

  /** Unlock audio on the first user gesture, so a later incoming call can ring. */
  prime(): void {
    if (this.primed || typeof window === 'undefined') return;
    this.primed = true;
    const unlock = () => {
      this.context();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  ringback(): void {
    this.play(RINGBACK, true);
  }

  ringtone(): void {
    this.play(RINGTONE, true);
    this.vibrate(true);
  }

  failed(): void {
    this.play(FAILED, false);
  }

  ended(): void {
    this.play(ENDED, false);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const osc of this.sounding) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sounding = [];
    this.vibrate(false);
  }

  private context(): AudioContext | null {
    const Ctor = typeof window !== 'undefined'
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
    if (!Ctor) return null;
    try {
      this.ctx ??= new Ctor();
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private play(pattern: Step[], repeat: boolean): void {
    this.stop();
    const ctx = this.context();
    if (!ctx) return;
    let index = 0;
    const next = () => {
      if (index >= pattern.length) {
        if (!repeat) {
          this.timer = null;
          return;
        }
        index = 0;
      }
      const [frequencies, ms] = pattern[index++];
      if (frequencies.length) this.tone(ctx, frequencies, ms);
      this.timer = setTimeout(next, ms);
    };
    next();
  }

  /** One burst, faded in and out so it does not click. */
  private tone(ctx: AudioContext, frequencies: number[], ms: number): void {
    const start = ctx.currentTime;
    const end = start + ms / 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(VOLUME / frequencies.length, start + 0.02);
    gain.gain.setValueAtTime(VOLUME / frequencies.length, Math.max(start + 0.02, end - 0.03));
    gain.gain.linearRampToValueAtTime(0, end);
    gain.connect(ctx.destination);
    for (const frequency of frequencies) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(start);
      osc.stop(end);
      osc.onended = () => {
        this.sounding = this.sounding.filter((o) => o !== osc);
      };
      this.sounding.push(osc);
    }
  }

  private vibrate(on: boolean): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(on ? [...VIBRATE, ...VIBRATE, ...VIBRATE, ...VIBRATE, ...VIBRATE, ...VIBRATE] : 0);
    } catch {
      /* not allowed here */
    }
  }
}

export const callTones = new CallTones();
