'use strict';

const Splicer = require('stream-splicer');
const debug = require('debug')('Session');
const EndlessPassThrough = require('./EndlessPassThrough.js');
const IcapHeadersReceiver = require('./IcapHeadersReceiver.js');
const IcapSession = require('./IcapSession.js');

class Session extends Splicer {
    constructor() {
        debug('constructor');

        const session = super({
            decodeStrings: false
        });
        start(session);
        return session;
    }
}

module.exports = Session;

async function start(session) {
    if (session._running) {
        throw new Error('Already started');
    }
    session._running = true;

    let i = 5;
    while (session._running && --i) {
        try {
            const icapHeadersBuffer = await getIcapHeadersBuffer(session);
            const icapSession = new IcapSession(icapHeadersBuffer);
            session.push(icapSession);

            session.emit('session', icapSession);
            debug('waiting for icapSession to finish');

            await icapSession.waitUntilDone();
            debug('icapSession finished');
            // session.unshift(leftover2);
            session.pop();
        } catch(e) {
            debug('error', e);
            session.emit('error', e);
            break;
        }
    }
}

async function getIcapHeadersBuffer(session) {
    const icapHeadersReceiver = new IcapHeadersReceiver();
    session.push(icapHeadersReceiver);
    session.push(new EndlessPassThrough());
    debug('waiting to receive icap headers');
    await waitForEnd(icapHeadersReceiver);
    debug('received icap headers');
    session.pop();
    session.pop();
    return icapHeadersReceiver.buffer;
}

async function waitForEnd(stream) {
    return new Promise(resolve => {
        if (stream._readableState.ended) { // TODO: don't use private props
            return resolve();
        }
        stream.once('end', resolve);
    });
}
