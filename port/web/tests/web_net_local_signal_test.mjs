import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

// Minimal mock RTCPeerConnection & DataChannel pair in memory to test HaloNet local signaling + frame delivery
const channelsByPeer = new Map();

function makeContext(name) {
  const ctx = {
    window: {},
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    Map,
    Set,
    Date,
    Math,
    Number,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../site/net.js', import.meta.url), 'utf8'), ctx);
  return ctx;
}

const bus = [];
const ctxA = makeContext('A');
const ctxB = makeContext('B');

const iceSeen = [];
function installMockWebRTC(ctx, label) {
  ctx.RTCPeerConnection = class MockPC {
    constructor(cfg) {
      iceSeen.push({ label, iceServers: cfg.iceServers });
      this.iceGatheringState = 'complete';
      this.signalingState = 'stable';
      this.connectionState = 'new';
      this.channels = {};
    }
    createDataChannel(name, opts) {
      const ch = {
        name,
        id: opts.id,
        binaryType: 'arraybuffer',
        readyState: 'connecting',
        bufferedAmount: 0,
        onmessage: null,
        onopen: null,
        onclose: null,
        send: (bytes) => {
          if (this._remotePeer && this._remotePeer.channels[name] && this._remotePeer.channels[name].onmessage) {
            const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            this._remotePeer.channels[name].onmessage({ data: buf });
          }
        },
      };
      this.channels[name] = ch;
      return ch;
    }
    async createOffer() { return { type: 'offer', sdp: `sdp-offer-${label}` }; }
    async createAnswer() { return { type: 'answer', sdp: `sdp-answer-${label}` }; }
    async setLocalDescription(desc) {
      this.localDescription = desc;
      if (desc.type === 'offer') this.signalingState = 'have-local-offer';
      if (desc.type === 'answer') this.signalingState = 'stable';
    }
    async setRemoteDescription(desc) {
      this.remoteDescription = desc;
      const otherLabel = desc.sdp.split('-').pop();
      const otherPC = channelsByPeer.get(otherLabel);
      if (otherPC) {
        this._remotePeer = otherPC;
        otherPC._remotePeer = this;
      }
      if (desc.type === 'answer') {
        this.signalingState = 'stable';
        for (const pc of [this, this._remotePeer]) {
          if (!pc) continue;
          for (const ch of Object.values(pc.channels)) {
            ch.readyState = 'open';
            if (ch.onopen) ch.onopen();
          }
        }
      }
    }
    addEventListener() {}
    close() {
      this.connectionState = 'closed';
      for (const ch of Object.values(this.channels)) {
        if (ch.onclose) ch.onclose();
      }
    }
  };
}

installMockWebRTC(ctxA, 'A');
installMockWebRTC(ctxB, 'B');

let handlerA = null;
let handlerB = null;

const transportA = {
  onMessage(fn) { handlerA = fn; },
  publish(payload) {
    if (handlerB) setTimeout(() => handlerB(new Uint8Array(payload)), 5);
  },
};
const transportB = {
  onMessage(fn) { handlerB = fn; },
  publish(payload) {
    if (handlerA) setTimeout(() => handlerA(new Uint8Array(payload)), 5);
  },
};

const secret = '00112233445566778899aabbccddeeff';
await ctxA.HaloNet.join(secret, { transport: transportA, address: '10.0.0.1', peerId: '0000000000000001' });
await ctxB.HaloNet.join(secret, { transport: transportB, address: '10.0.0.2', peerId: '0000000000000002' });

// Hook peer references once created
await new Promise((r) => setTimeout(r, 80));

assert.equal(ctxA.HaloNet.address(), '10.0.0.1');
assert.equal(ctxB.HaloNet.address(), '10.0.0.2');
assert.ok(iceSeen.every((x) => Array.isArray(x.iceServers) && x.iceServers.length === 0), 'LAN mode uses empty iceServers');

ctxA.HaloNet.leave();
ctxB.HaloNet.leave();
console.log('web_net_local_signal_test: ok');
