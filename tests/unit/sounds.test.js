const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("sounds reuse the reverb buffer, stop overlap, and release the completed graph", async () => {
  const timers = new Map();
  let nextTimer = 1;
  const window = {
    MDManager: {},
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  class FakeParam {
    cancelScheduledValues() {}
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class FakeNode {
    constructor() { this.connections = []; this.disconnected = false; }
    connect(node) { this.connections.push(node); return node; }
    disconnect() { this.disconnected = true; }
  }
  class FakeGain extends FakeNode {
    constructor() { super(); this.gain = new FakeParam(); }
  }
  class FakeOscillator extends FakeNode {
    constructor() {
      super();
      this.frequency = new FakeParam();
      this.listeners = new Map();
      this.stopped = false;
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    start() {}
    stop() { this.stopped = true; }
    finish() { this.listeners.get("ended")?.(); }
  }
  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 4;
      this.destination = {};
      this.bufferCount = 0;
      this.gains = [];
      this.oscillators = [];
      FakeAudioContext.instance = this;
    }
    async resume() {}
    createBuffer(channels, frames) {
      this.bufferCount += 1;
      const values = Array.from({ length: channels }, () => new Float32Array(frames));
      return { numberOfChannels: channels, getChannelData: channel => values[channel] };
    }
    createConvolver() { return new FakeNode(); }
    createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
    createOscillator() { const oscillator = new FakeOscillator(); this.oscillators.push(oscillator); return oscillator; }
  }
  FakeAudioContext.instance = null;
  const context = vm.createContext({ window, AudioContext: FakeAudioContext });
  const source = fs.readFileSync(path.join(__dirname, "../../ui/sounds.js"), "utf8");
  vm.runInContext(source, context, { filename: "ui/sounds.js" });

  await window.MDManager.sounds.play();
  const audio = FakeAudioContext.instance;
  const firstSources = audio.oscillators.slice();
  assert.equal(audio.bufferCount, 1);
  await window.MDManager.sounds.play();
  assert.equal(audio.bufferCount, 1);
  assert.ok(firstSources.every(oscillator => oscillator.stopped && oscillator.disconnected));

  const currentSources = audio.oscillators.slice(2);
  const currentBus = audio.gains.filter(gain => gain.connections.includes(audio.destination)).at(-1);
  assert.equal(currentBus.gain.value, .12);
  currentSources.forEach(sourceNode => sourceNode.finish());
  assert.equal(timers.size, 1);
  timers.values().next().value();
  assert.equal(currentBus.disconnected, true);
});
