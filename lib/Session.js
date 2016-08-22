'use strict';

// const ICAP_PREVIEW_EOF = Buffer.from('0; ieof');
// const ICAP_BODY_EOF = Buffer.from('0');

const stream = require('stream');
const debug = require('debug')('Session');

const IcapHeadersReceiver = require('./IcapHeadersReceiver.js');
const HttpHeadersReceiver = require('./HttpHeadersReceiver.js');
const BodyStream = require('./streams/BodyStream.js');

module.exports = Session;

class Session extends stream.Transform {
    constructor() {
        debug('constructor');
        this._externalPipes = [];

        this.start();
        return super({
            decodeStrings: false
        });
    }

    async start() {
        if (this._running) {
            throw new Error('Already started');
        }
        this._running = true;

        while(this._running) {
            const initialData = await this._waitForInitialData();
            const {decoded, remaining} = initialData;
            createRegionStreams(decoded);
            this.emit('request', decoded);
            await this._handlePayload(decoded, remaining);
        }
    }

    stop() {
        this._running = false;
        // TODO: remove event listeners if current stream group doesn't finish before some timeout
    }

    async _waitForInitialData() {
        const icapHeadersReceiver = new IcapHeadersReceiver();
        this._pipe(icapHeadersReceiver);
        debug('waiting to receive icap headers');
        await icapHeadersReceiver.waitUntilDone();
        debug('received icap headers');

        const decoded = icapHeadersReceiver.decoded;
        const remaining = icapHeadersReceiver.remaining;
        this.unpipe(icapHeadersReceiver);
        return {decoded, remaining};
    }

    pipe(dest) {
        if (this._pipable) {
            return super.pipe(dest);
        }
        this._externalPipes.push(dest);
    }

    _pipe(dest) {
        this._pipable = false;
        return super.pipe(dest);
    }

    _transform(chunk, encoding, cb) {
        cb(null, chunk);
    }

    async _handlePayload(decoded, remaining) {
        for (let i = 0; i < decoded.streams.length; ++i) {
            const regionName = decoded.streams[i][0];
            const stream = decoded.streams[i][1];
            debug(`waiting to receive ${regionName}`);
            await this._waitForStream(stream, remaining);
            debug(`received ${regionName}`);
        }
    }

    _waitForStream(stream, remaining) {
        const self = this;
        stream.on('done', streamDone);
        if (Buffer.isBuffer(remaining) && remaining.length > 0) {
            stream.push(remaining);
        }
        this._pipe(stream);

        function streamDone() {
            self.unpipe(stream);
        }
    }
}

function createRegionStreams(decoded) {
    let ix = 0, region;
    while (region = decoded.icapDetails.encapsulatedRegions[ix]) {
        const nextRegion = decoded.icapDetails.encapsulatedRegions[ix + 1];
        if (nextRegion) {
            // Only headers can be received before the single *-body
            decoded.streams.push([region.name, new HttpHeadersReceiver(nextRegion.startOffset - region.startOffset)]);
        } else if (region.name !== 'null-body') {
        } else {
            // *-body with data
            decoded.streams.push([region.name, new BodyStream()]);
        }
        ++ix;
    }
}
