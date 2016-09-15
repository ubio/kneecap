'use strict';

const Splicer = require('stream-splicer');
const debug = require('debug')('Session');
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

    while (session._running) {
        try {
            const icapHeadersBuffer = await getIcapHeadersBuffer(session);
            const icapSession = new IcapSession(icapHeadersBuffer);

            session.emit('session', icapSession);
            debug('waiting for icapSession to finish');

            // const leftover2 = await icapSession.waitUntilDone();
            // debug('icapSession finished');
            // session.unshift(leftover2);
            // session.pop();
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
    debug('waiting to receive icap headers');
    const buffer = await icapHeadersReceiver.waitUntilDone();
    debug('received icap headers');
    session.pop();
    return buffer;
}
