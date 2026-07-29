window.MDManager = window.MDManager || {};

(function (app) {
  /** @type {AudioContext | null} */
  let context = null;
  /** @type {AudioScheduledSourceNode[]} */
  let activeSources = [];
  /** @type {GainNode | null} */
  let activeBus = null;
  /** @type {AudioBuffer | null} */
  let plateImpulse = null;
  /** @type {number | null} */
  let cleanupTimer = null;
  let requestId = 0;
  let muted = false;

  function stopActive() {
    if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
    cleanupTimer = null;
    if (activeBus && context) {
      activeBus.gain.cancelScheduledValues(context.currentTime);
      activeBus.gain.setValueAtTime(0, context.currentTime);
      activeBus.disconnect();
    }
    activeSources.forEach(source => {
      try { source.stop(); } catch { /* Source already stopped. */ }
      source.disconnect();
    });
    activeSources = [];
    activeBus = null;
  }

  /** @param {GainNode} bus */
  function createPlate(bus) {
    const audioContext = context;
    if (!audioContext) throw new Error("Audio context is unavailable.");
    const plate = audioContext.createConvolver();
    if (!plateImpulse) {
      const frameCount = audioContext.sampleRate;
      plateImpulse = audioContext.createBuffer(2, frameCount, audioContext.sampleRate);
      let seed = 48271;
      for (let channel = 0; channel < plateImpulse.numberOfChannels; channel += 1) {
        const samples = plateImpulse.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) {
          seed = seed * 16807 % 2147483647;
          const decay = Math.pow(1 - index / samples.length, 3);
          samples[index] = (seed / 1073741824 - 1) * decay;
        }
      }
    }
    plate.buffer = plateImpulse;
    plate.connect(bus);
    return plate;
  }

  /**
   * @param {GainNode} bus
   * @param {ConvolverNode} plate
   * @param {number} start
   * @param {Array<{ time: number, frequency: number }>} points
   * @param {number} attack
   * @param {number} hold
   * @param {number} release
   * @param {number} gain
   */
  function notificationVoice(bus, plate, start, points, attack, hold, release, gain) {
    const audioContext = context;
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const dry = audioContext.createGain();
    const wet = audioContext.createGain();
    const duration = attack + hold + release;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(points[0].frequency, start + points[0].time);
    points.slice(1).forEach(point => {
      oscillator.frequency.exponentialRampToValueAtTime(point.frequency, start + point.time);
    });
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + attack);
    envelope.gain.setValueAtTime(gain, start + attack + hold);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    dry.gain.value = .8;
    wet.gain.value = .2;
    oscillator.connect(envelope);
    envelope.connect(dry).connect(bus);
    envelope.connect(wet).connect(plate);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
    activeSources.push(oscillator);
    oscillator.addEventListener("ended", () => {
      const index = activeSources.indexOf(oscillator);
      if (index >= 0) activeSources.splice(index, 1);
      oscillator.disconnect();
      if (!activeSources.length && activeBus === bus) {
        cleanupTimer = window.setTimeout(() => {
          cleanupTimer = null;
          if (activeBus !== bus) return;
          bus.disconnect();
          activeBus = null;
        }, 1000);
      }
    }, { once: true });
  }

  async function play() {
    if (muted) return;
    const currentRequest = ++requestId;
    if (!context) context = new AudioContext();
    await context.resume();
    if (muted || currentRequest !== requestId) return;
    stopActive();

    const bus = context.createGain();
    bus.gain.value = .3;
    bus.connect(context.destination);
    activeBus = bus;
    const plate = createPlate(bus);
    const start = context.currentTime + .008;

    notificationVoice(bus, plate, start, [{ time: 0, frequency: 65.41 }, { time: .085, frequency: 130.81 }], .01, .13, .255, .9);
    notificationVoice(bus, plate, start + .22, [{ time: 0, frequency: 196 }, { time: .07, frequency: 392 }], .02, .16, .305, 1);
  }

  /** @param {boolean} value */
  function setMuted(value) {
    muted = value;
    if (muted) {
      requestId += 1;
      stopActive();
    }
  }

  app.sounds = { play, setMuted, isMuted: () => muted };
})(window.MDManager);
