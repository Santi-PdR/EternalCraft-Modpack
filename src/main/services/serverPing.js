const net = require('net');

function encodeVarInt(value) {
  let n = value >>> 0;
  const bytes = [];
  do {
    let temp = n & 0x7f;
    n >>>= 7;
    if (n !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (n !== 0);
  return Buffer.from(bytes);
}

function decodeVarInt(buffer, offset = 0) {
  let numRead = 0;
  let result = 0;
  let read;
  do {
    if (offset + numRead >= buffer.length) return null;
    read = buffer[offset + numRead];
    const value = read & 0x7f;
    result |= value << (7 * numRead);
    numRead++;
    if (numRead > 5) throw new Error('VarInt demasiado largo');
  } while ((read & 0x80) !== 0);
  return { value: result, bytes: numRead };
}

function mcString(value) {
  const data = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeVarInt(data.length), data]);
}

function packet(id, payload = Buffer.alloc(0)) {
  const body = Buffer.concat([encodeVarInt(id), payload]);
  return Buffer.concat([encodeVarInt(body.length), body]);
}

function pingMinecraftServer(host, port, timeout = 3500) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let incoming = Buffer.alloc(0);
    let finished = false;

    const done = (value) => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch (_) {}
      resolve(value);
    };

    socket.setTimeout(timeout);
    socket.once('timeout', () => done({ online: false, error: 'timeout' }));
    socket.once('error', (err) => done({ online: false, error: err.code || err.message }));

    socket.connect(port, host, () => {
      const address = mcString(host);
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port, 0);
      // 763 = Minecraft 1.20/1.20.1. El servidor de estado suele responder aunque el protocolo difiera.
      const handshake = Buffer.concat([encodeVarInt(763), address, portBuf, encodeVarInt(1)]);
      socket.write(packet(0x00, handshake));
      socket.write(packet(0x00));
    });

    socket.on('data', (chunk) => {
      incoming = Buffer.concat([incoming, chunk]);
      try {
        const packetLength = decodeVarInt(incoming, 0);
        if (!packetLength) return;
        if (incoming.length < packetLength.bytes + packetLength.value) return;

        let cursor = packetLength.bytes;
        const packetId = decodeVarInt(incoming, cursor);
        if (!packetId) return;
        cursor += packetId.bytes;
        if (packetId.value !== 0x00) return done({ online: false, error: 'respuesta inesperada' });

        const strLen = decodeVarInt(incoming, cursor);
        if (!strLen) return;
        cursor += strLen.bytes;
        if (incoming.length < cursor + strLen.value) return;

        const json = incoming.subarray(cursor, cursor + strLen.value).toString('utf8');
        const data = JSON.parse(json);
        done({
          online: true,
          latency: Date.now() - started,
          players: {
            online: data.players?.online ?? 0,
            max: data.players?.max ?? 0,
            sample: data.players?.sample || []
          },
          version: data.version?.name || 'Desconocida',
          protocol: data.version?.protocol ?? null,
          description: typeof data.description === 'string' ? data.description : data.description?.text || '',
          favicon: typeof data.favicon === 'string' && data.favicon.startsWith('data:image/') ? data.favicon : null
        });
      } catch (err) {
        done({ online: false, error: err.message });
      }
    });
  });
}

module.exports = { pingMinecraftServer, encodeVarInt, decodeVarInt };
