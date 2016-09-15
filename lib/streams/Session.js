'use strict';

const stream = require('stream');
const Splicer = require('stream-splicer');
const debug = require('debug')('Session');
const EndlessPassThrough = require('./EndlessPassThrough.js');
const IcapHeadersReceiver = require('./IcapHeadersReceiver.js');
const IcapSession = require('./IcapSession.js');

class Session extends Splicer {
    constructor() {
        debug('constructor');

        const reader = new stream.PassThrough();
        const session = super([
            reader
        ], {
            decodeStrings: false
        });
        session.reader = reader;
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
            const {unshifts, icapHeadersBuffer} = await getIcapHeadersBuffer(session);
            const icapSession = new IcapSession(icapHeadersBuffer);
            session.push(icapSession);
            session.push(new EndlessPassThrough());
            unshifts.forEach(chunk => session.reader.unshift(chunk));

            session.emit('session', icapSession);
            debug('waiting for icapSession to finish');

            await waitForEnd(icapSession);
            debug('icapSession finished');
            session.pop();
            session.pop();
        } catch(e) {
            debug('error', e);
            session.emit('error', e);
            break;
        }
    }
}

async function getIcapHeadersBuffer(session) {
    const unshifts = [];
    const icapHeadersReceiver = createIHR();
    debug('waiting to receive icap headers');
    await waitForEnd(icapHeadersReceiver);
    debug('received icap headers');
    cleanupIHR();
    return {unshifts, icapHeadersBuffer: icapHeadersReceiver.buffer};

    function createIHR() {
        const ihr = new IcapHeadersReceiver();
        ihr.on('parent-unshift', onParentUnshift);
        session.push(ihr);
        session.push(new EndlessPassThrough());
        return ihr;
    }

    function cleanupIHR() {
        session.pop();
        session.pop();
        icapHeadersReceiver.removeListener('parent-unshift', onParentUnshift);
    }

    function onParentUnshift(chunk) {
        unshifts.push(chunk);
    }
}

async function waitForEnd(stream) {
    return new Promise(resolve => {
        if (stream._readableState.ended) { // TODO: don't use private props
            return resolve();
        }
        stream.once('end', resolve);
    });
}
