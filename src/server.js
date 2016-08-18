'use strict';

const net = require('net');
const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('server');

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
        return new Promise(resolve => {
            _server.close(resolve);
        });
    }

    function handleServerError(err) {
        events.emit('error', err);
    }

    function handleConnection(socket) {
        const connection = createIcapConnection(socket);

        connection.events.on('error', handleServerError);

        connection.events.on('icap-request', icapDetails => {
            const handler = handlers[icapDetails.path];

            try {
                if (!handler) {
                    return connection.badRequest();
                }

                if (icapDetails.method === 'OPTIONS') {
                    return handleOptions(connection, handler);
                }

                if (handler.method !== icapDetails.method) {
                    return connection.badRequest();
                }

            } catch (err) {
                events.emit('error', err);
                return;
            }

            const icapRequest = createIcapRequest(icapDetails, connection);

            Promise.resolve()
                .then(() => handler.fn(icapRequest))
                .then(response => {

                    if (!response) {
                        debug('dontChange');
                        return connection.dontChange();
                    }
                    /**
                     * bodyFromUser source depends on response.requestHeaders or response.responseHeaders presence
                     * responseType depends on response.requestHeaders or response.responseHeaders presence
                     *
                     * responseDetails = {
                     *  bodyFromUser: response.requestBody | response.responseBody | undefined
                     *  requestType: 'request' | 'response'
                     *  responseType: 'request' | 'response'
                     * }
                     */
                    const responseDetails = getBodyDetails(handler.method, response);
                    const requestType = responseDetails.requestType;
                    const responseType = responseDetails.responseType;
                    const bodyFromUser = responseDetails.bodyFromUser;
                    let body;
                    debug(`body from ${responseType} ${bodyFromUser ? 'user' : 'icap'}`);
                    if (bodyFromUser) {
                        body = sanitizeBody(bodyFromUser);
                    } else if (responseType === requestType) {
                        body = sanitizeBody(icapRequest.getRawBody());
                    }
                    return Promise.all([
                        sanitizeRequestHeaders(response.requestHeaders, icapRequest),
                        sanitizeResponseHeaders(response.responseHeaders, icapRequest),
                        body,
                    ])
                        .then(results => {
                            const [
                                requestHeaders,
                                responseHeaders,
                                body
                            ] = results;
                            const response = {
                                statusCode: 200,
                                statusText: 'OK',
                            };
                            if (responseType === 'request') {
                                response.payload = new Map([
                                    ['req-hdr', requestHeaders],
                                    ['req-body', body]
                                ]);
                            } else {
                                response.payload = new Map([
                                    ['res-hdr', responseHeaders],
                                    ['res-body', body]
                                ]);
                            }
                            connection.respond(response);
                        });
                })
                .catch(err => {
                    events.emit('error', err);
                    if (!connection.isClosed()) {
                        connection.badRequest();
                    }
                });
        });
    }

    function getBodyDetails(method, userResponse) {
        if (method === 'REQMOD') {
            const requestType = 'request';
            if (!!userResponse.responseHeaders) {
                return {
                    bodyFromUser: userResponse.responseBody,
                    responseType: 'response',
                    requestType
                };
            }
            return {
                bodyFromUser: userResponse.requestBody,
                responseType: 'request',
                requestType
            };
        }
        const requestType = 'response';
        return {
            bodyFromUser: userResponse.responseBody,
            responseType: requestType,
            requestType
        };
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

function sanitizeBody(body) {
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
