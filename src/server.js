'use strict';

const net = require('net');
const EventEmitter = require('events').EventEmitter;

const createIcapConnection = require('./connection.js');
const createIcapRequest = require('./request.js');

const DEFAULT_TRANSFER = {
    complete: ['html', 'json'],
    ignore: [
        'bat', 'exe', 'com', 'bin', 'pkg', 'gz', 'zip', 'ogg',
        'asp', 'css', 'swf', 'mp3', 'wav', 'gif', 'jpg', 'jpeg'
    ],
    preview: ['*']
};

const PREVIEW_BYTES = 10;

module.exports = function createServer(options) {
    const _server = net.createServer(options);
    const events = new EventEmitter();

    // path => { method: 'reqmod|respmod', fn: icapRequest => Promise }
    const handlers = {};

    const server = {
        events,
        listen,
        close,
        requestHandler,
        responseHandler
    };

    _server.on('connection', handleConnection);
    _server.on('error', handleServerError);

    return Object.freeze(server);

    function listen(...args) {
        return new Promise(resolve => {
            _server.listen(...args.concat(resolve));
        });
    }

    function close() {
        _server.close();
    }

    function handleServerError(err) {
        events.emit('error', err);
    }

    function handleConnection(socket) {
        const connection = createIcapConnection(socket);
        
        connection.events.on('icap-request', icapDetails => {
            const handler = handlers[icapDetails.path];
            if (!handler) {
                return connection.badRequest();
            }

            if (icapDetails.method === 'OPTIONS') {
                return handleOptions(connection, handler);
            }

            if (handler.method !== icapDetails.method) {
                return connection.badRequest();
            }

            const icapRequest = createIcapRequest(icapDetails, connection);
            const promise = handler.fn(icapRequest);
            if (!promise) {
                return connection.dontChange();
            }
            return promise.then(response => {
                if (!response) {
                    return connection.dontChange();
                }
                return Promise.all([
                    sanitizeRequestHeaders(response.requestHeaders, icapRequest),
                    sanitizeResponseHeaders(response.responseHeaders, icapRequest),
                    sanitizeBody(response.requestBody, icapRequest),
                    sanitizeBody(response.responseBody, icapRequest),
                ])
                    .then(results => {
                        const [
                            requestHeaders,
                            responseHeaders,
                            requestBody,
                            responseBody
                        ] = results;
                        connection.respond({
                            statusCode: 200,
                            statusText: 'OK',
                            payload: new Map([
                                ['req-hdr', requestHeaders],
                                ['res-hdr', responseHeaders],
                                ['req-body', requestBody],
                                ['res-body', responseBody]
                            ])
                        });
                    });
            })
                .catch(err => {
                    console.log('handler threw', err);
                    connection.badRequest();
                });
        });
    }

    function handleOptions(connection, handler) {
        const headers = [
            ['Methods', handler.method]
        ];
        const transfer = handler.options.transfer;
        if (transfer.complete) {
            headers.push(['Transfer-Complete', transfer.complete]);
        }
        if (transfer.ignore) {
            headers.push(['Transfer-Ignore', transfer.ignore]);
        }
        if (transfer.preview) {
            headers.push(['Transfer-Preview', transfer.preview]);
        }
        if (handler.options.previewBytes) {
            headers.push(['Preview', handler.options.previewBytes]);
        }
        connection.respond({
            statusCode: 200,
            statusText: 'OK',
            headers: new Map(headers)
        });
    }

    function requestHandler(path, options, fn) {
        if (typeof options === 'function') {
            fn = options;
            options = {};
        }
        handlers[path] = {
            method: 'REQMOD',
            fn,
            options: sanitizeOptions(options)
        };
    }

    function responseHandler(path, options, fn) {
        if (typeof options === 'function') {
            fn = options;
            options = {};
        }
        handlers[path] = {
            method: 'RESPMOD',
            fn,
            options: sanitizeOptions(options)
        };
    }

};

function sanitizeRequestHeaders(headers, icapRequest) {
    if (!headers) {
        if (!icapRequest.hasRequestHeaders()) {
            return;
        }
        return icapRequest.getRawRequestHeaders();
    }
    return sanitizeHeaders(headers);
}

function sanitizeResponseHeaders(headers, icapRequest) {
    if (!headers) {
        if (!icapRequest.hasResponseHeaders()) {
            return;
        }
        return icapRequest.getRawResponseHeaders();
    }
    return sanitizeHeaders(headers);
}

function sanitizeBody(body, icapRequest) {
    if (!body) {
        if (!icapRequest.hasBody()) {
            return;
        }
        return icapRequest.getRawBody();
    }
    return body;
}

function sanitizeHeaders(headersString) {
    return Buffer.from(headersString);
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
