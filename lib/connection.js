'use strict';

const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('icap:connection');

const Session = require('./Session.js');

module.exports = function connectionHandler(socket) {
    debug('new connection');

    let connected = true;

    socket.on('close', () => connected = false);
    socket.on('error', err => {
        debug('socket error', err);
        connected = false;
    });

    const events = new EventEmitter();
    const sessionDecoder = new Session(socket);
    socket.pipe(sessionDecoder);

    sessionDecoder.on('session', handleIcapSession);

    return Object.freeze({
        events,
        isConnected: () => connected
    });

    function handleIcapSession(icapSession) {
        events.emit('session', icapSession);
    }
};

// kc.requestHandler(request => {
//     if (iDontWantToChange) {
//         return request.dontChange();
//     }
// 
//     const headers = request.getFullHeaders().toString();
//     const firstLine = headers.split('\n')[0];
//     if (firstLine.includes('image.png')) {
//         request.responseHeaders = getPngHeaders();
//         request.responseBody = fs.createReadStream('/path/to/image.png');
//         return;
//     }
// 
//     if (firstLine.indexOf('POST') === 0) {
//         const replaceCardData = new stream.Transform({
//             transform: (chunk, encoding, cb) => {
//                 cb(null, Buffer.from(chunk.toString().replace('a', 'b')));
//             }
//         });
// 
//         request.requestHeaders(Buffer.from(headers));
//         request.requestBody = request.bodyStream.pipe(replaceCardData);
//         return;
//     }
// 
//     if (firstLine.indexOf('GET') === 0) {
//         request.requestHeaders(Buffer.from(headers.replace(/x-roxi-.*\n/i, '')));
//         return;
//     }
// 
//     // return; // don't change anything
// });

