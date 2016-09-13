'use strict';

// const ICAP_PREVIEW_EOF = Buffer.from('0; ieof');
// const ICAP_BODY_EOF = Buffer.from('0');

const stream = require('stream');
const debug = require('debug')('Session');

const IcapSession = require('./IcapSession.js');
const IcapHeadersReceiver = require('./IcapHeadersReceiver.js');

class Session extends stream.Duplex {
    constructor() {
        debug('constructor');

        const session = super({
            decodeStrings: false
        });
        session.start();
        // session._externalPipe = null;
        return session;
    }

    async start() {
        if (this._running) {
            throw new Error('Already started');
        }
        this._running = true;

        while(this._running) {
            const icapHeadersReceiver = new IcapHeadersReceiver();
            this._pipe(icapHeadersReceiver);
            debug('waiting to receive icap headers');

            await icapHeadersReceiver.waitUntilDone();
            debug('received icap headers');
            this._unpipe(icapHeadersReceiver);

            const remaining = icapHeadersReceiver.remaining;
            const icapSession = new IcapSession(icapHeadersReceiver.buffer, remaining);
            const pipeDestination = this.externalPipe; // TODO: update this.externalPipe if it changes
            this._pipe(icapSession).pipe(pipeDestination);
            this.emit('session', icapSession);
            debug('waiting for icapSession to finish');

            await icapSession.waitUntilDone();
            debug('icapSession finished');
            this._unpipe(icapSession);
            icapSession.unpipe(pipeDestination);
        }
    }

    stop() {
        this._running = false;
        // TODO: remove event listeners if current stream group doesn't finish before some timeout
    }

    pipe(dest) {
        // If we ever decide to support multiple pipes here, we will have to be smarter
        // about this.externalPipe. For now, single pipe, this suffices.
        this.externalPipe = dest;
    }

    unpipe(dest) {
        if (dest) {
            this._unpipe(dest);
            if (dest === this.externalPipe) {
                this.externalPipe = null;
            }
        } else {
            this._unpipe(this.externalPipe);
        }
    }

    _unpipe(dest) {
        return super.unpipe(dest);
    }

    _pipe(dest) {
        return super.pipe(dest);
    }
}

module.exports = Session;
