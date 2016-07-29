'use strict';

const net = require('net');
const EventEmitter = require('events').EventEmitter;

const createIcapTransaction = require('./transaction.js');
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
        let currentTransaction = createIcapTransaction(socket);
        handleTransaction(currentTransaction);

        currentTransaction.events.once('finished', finishedHandler);
        function finishedHandler() {
            currentTransaction = createIcapTransaction(socket);
            currentTransaction.events.once('finished', finishedHandler);
            handleTransaction(currentTransaction);
        }
    }

    function handleTransaction(transaction) {
        transaction.events.on('icap-headers', icapDetails => {
            const handler = handlers[icapDetails.path];
            if (!handler) {
                return transaction.badRequest();
            }

            if (icapDetails.method === 'OPTIONS') {
                return handleOptions(transaction, handler);
            }

            if (handler.method !== icapDetails.method) {
                return transaction.badRequest();
            }

            const icapRequest = createIcapRequest(icapDetails, transaction);
            const promise = handler.fn(icapRequest);
            if (!promise) {
                return transaction.dontChange();
            }
            return promise.then(response => {
                if (!response) {
                    return transaction.dontChange();
                }
                return Promise.all([
                    sanitizeRequestHeaders(response.requestHeaders, icapRequest),
                    sanitizeResponseHeaders(response.responseHeaders, icapRequest),
                    sanitizeRequestBody(response.requestBody, icapRequest),
                    sanitizeResponseBody(response.responseBody, icapRequest),
                ])
                    .then(results => {
                        const [
                            requestHeaders,
                            responseHeaders,
                            requestBody,
                            responseBody
                        ] = results;
                        transaction.respond({
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
                    transaction.badRequest();
                });
        });
    }

    function handleOptions(transaction, handler) {
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
        transaction.respond({
            statusCode: 200,
            statusText: 'OK',
            icapHeaders: new Map(headers)
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

function sanitizeRequestBody(body, icapRequest) {
    if (!body) {
        if (!icapRequest.hasRequestBody()) {
            return;
        }
        return icapRequest.getRawRequestBody();
    }
    return body;
}

function sanitizeResponseBody(body, icapRequest) {
    if (!body) {
        if (!icapRequest.hasResponseBody()) {
            return;
        }
        return icapRequest.getRawResponseBody();
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
