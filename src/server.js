'use strict';

const net = require('net');
const EventEmitter = require('events').EventEmitter;

const createIcapTransaction = require('./transaction.js');
const createIcapRequest = require('./request.js');

const DEFAULT_TRANSFER_SETTINGS = {
    complete: ['html', 'json'],
    ignore: [
        'bat', 'exe', 'com', 'bin', 'pkg', 'gz', 'zip', 'ogg',
        'asp', 'css', 'swf', 'mp3', 'wav', 'gif', 'jpg', 'jpeg'
    ],
    PREVIEW: ['*']
};

const PREVIEW_BYTES = 10;

module.exports = function createServer(options) {
    const _server = net.createServer(options);
    const events = new EventEmitter();

    // path => { method: 'reqmod|respmod', fn: icapRequest => Promise }
    const handlers = {};

    const server = {
        listen,
        events,
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

    function handleServerError(err) {
        events.emit('error', err);
    }

    function handleConnection(socket) {
        let currentTransaction = createIcapTransaction(socket);
        handleTransaction(currentTransaction);

        currentTransaction.on('finished', finishedHandler);

        function finishedHandler() {
            unhandleTransaction(currentTransaction);
            currentTransaction = createIcapTransaction(socket);
            handleTransaction(currentTransaction);
        }
    }

    function handleTransaction(transaction) {
        transaction.on('icap-headers', icapDetails => {
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
            return handler.fn(icapRequest)
                .then(response => {
                    if (!response) {
                        return transaction.dontChange();
                    }
                    return Promise.all([
                        sanitizeRequestHeaders(response.reqHeaders, icapRequest),
                        sanitizeResponseHeaders(response.respHeaders, icapRequest),
                        sanitizeRequestBody(response.reqBody, icapRequest),
                        sanitizeResponseBody(response.reqBody, icapRequest),
                    ])
                        .then(results => {
                            const [
                                reqHeaders,
                                respHeaders,
                                reqBody,
                                respBody
                            ] = results;
                            transaction.respond({
                                reqHeaders,
                                respHeaders,
                                reqBody,
                                respBody
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
            headers.push('Transfer-Complete', transfer.complete);
        }
        if (transfer.ignore) {
            headers.push('Transfer-Ignore', transfer.ignore);
        }
        if (transfer.preview) {
            headers.push('Transfer-Preview', transfer.preview);
        }
        if (handler.options.previewBytes) {
            headers.push('Preview', handler.options.previewBytes);
        }
        transaction.respond({
            statusCode: 200,
            statusText: 'OK',
            icapHeaders: new Map(headers)
        });
    }

    function unhandleTransaction(transaction) {
        
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
    options = options || {};
    const transfer = options.transfer || DEFAULT_TRANSFER_SETTINGS;
    ['complete', 'ignore', 'preview'].forEach(key => {
        const value = transfer[key];
        if (Array.isArray(value)) {
            transfer[key] = value.join(', ');
        }
        if (typeof value !== 'string') {
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
        previewBytes: options.previewBytes || PREVIEW_BYTES
    };
}
