'use strict';

const DEFAULT_TRANSFER = {
    complete: ['html', 'json'],
    ignore: [
        'bat', 'exe', 'com', 'bin', 'pkg', 'gz', 'zip', 'ogg',
        'asp', 'css', 'swf', 'mp3', 'wav', 'gif', 'jpg', 'jpeg'
    ],
    preview: ['*']
};
const PREVIEW_BYTES = 10;

const net = require('net');
const debug = require('debug');
const connectionHandler = require('./connection.js');
const Icap = require('./Icap.js');

class Server extends net.Server {
    constructor(...args) {
        debug('constructor');
        const server = super(...args);
        server.handlers = {};
        server.on('connection', socket => {
            debug('connection');
            handleConnection(server, socket);
        });
        return server;
    }

    listen(...args) {
        return new Promise(resolve => {
            const self = this;

            this.once('listening', onListening);

            if (typeof args[args.length - 1] === 'function') {
                this.once('listening', args.pop());
            }
            super.listen(...args);

            function onListening() {
                debug('listening');
                self.removeListener('listening', onListening);
                resolve(self);
            }
        });
    }

    requestHandler(path, options, fn) {
        setHandler(this, path, 'REQMOD', options, fn);
    }

    responseHandler(path, options, fn) {
        setHandler(this, path, 'RESPMOD', options, fn);
    }
}

module.exports = Server;

// Private instance methods

function setHandler(server, path, method, options, fn) {
    if (typeof options === 'function') {
        fn = options;
        options = {};
    }
    server.handlers[path] = {
        method,
        fn,
        options: sanitizeOptions(options)
    };
}

function handleConnection(server, socket) {
    const connection = connectionHandler(socket);
    connection.events.on('session', icapSession => {
        debug('session');
        const icap = new Icap(icapSession);
        handleIcap(server, icap);
    });
    connection.events.on('error', err => {
        debug('error', err);
        console.log('server got connection error', err);
    });
}

function handleIcap(server, icap) {
    const handler = server.handlers[icap.path];
    if (!handler) {
        return icap.badRequest();
    }
    if (icap.method === 'OPTIONS') {
        return handleOptions(handler, icap);
    }
    if (icap.method !== handler.method) {
        return icap.badRequest();
    }
    try {
        handler.fn(icap);
    } catch(err) {
        debug('handler error', err);
        icap.badRequest();
    }
}

// Helpers

function handleOptions(handler, icap) {
    icap.options({
        method: handler.method,
        transfer: handler.options.transfer,
        previewBytes: handler.options.previewBytes
    });
}

function sanitizeOptions(options) {
    const {
        previewBytes = PREVIEW_BYTES,
        transfer = DEFAULT_TRANSFER
    } = (options || {});
    ['complete', 'ignore', 'preview'].forEach(key => {
        const value = transfer[key];
        if (Array.isArray(value)) {
            transfer[key] = value.join(', ');
        } else if (typeof value !== 'string') {
            transfer[key] = '';
        }
    });
    // exactly one header must have star
    const transferStar = Object.keys(transfer)
        .map(k => transfer[k])
        .filter(value => value === '*');
    if (transferStar.length !== 1) {
        throw new Error('Exactly one transfer property must be a "*"');
    }
    return {
        transfer,
        previewBytes
    };
}

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
//     if (outputPreview) {
//         request.previewStream.pipe(console.stdout);
//     }
// 
//     if (firstLine.indexOf('GET') === 0) {
//         request.requestHeaders(Buffer.from(headers.replace(/x-roxi-.*\n/i, '')));
//         return;
//     }
// 
//     // return; // don't change anything
// });
