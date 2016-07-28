'use strict';

const net = require('net');
const EventEmitter = require('events').EventEmitter;

const createIcapTransaction = require('./transaction.js');
const createIcapRequest = require('./request.js');

module.exports = function createServer(options, listenOptions) {
    const _server = net.createServer(options);
    const events = new EventEmitter();

    const handlers = {
        OPTIONS: {},
        REQMOD: {},
        RESPMOD: {}
    };

    const server = {
        listen,
        events,
        requestHandler,
        responseHandler
    };

    _server.on('connection', handleConnection);
    _server.on('error', handleServerError);

    return Object.freeze(server);

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
            const method = icapDetails.method; // REQMOD, OPTIONS, RESPMOD
            const path = icapDetails.path; // '/request'
            const handler = handlers[method][path];

            if ('function' === typeof handler) {
                const icapRequest = createIcapRequest(icapDetails, transaction);
                return handler(icapRequest)
                    .then(response => {
                        if (!response) {
                            transaction.dontChange();
                        }
                        return Promise.all([
                            sanitizeRequestHeaders(response.reqHeaders, icapRequest),
                            sanitizeResponseHeaders(response.respHeaders, icapRequest),
                            sanitizeRequestBody(response.reqBody, icapRequest),
                            sanitizeResponseBody(response.reqBody, icapRequest),
                        ]);
                    })
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
                    })
                    .catch(err => {
                        console.log('handler threw', err);
                        // badRequest(transaction);
                    });
            }
            // badRequest(transaction);
            // statusCode: 400,
            // statusText: 'Bad request',
        });
    }

    function unhandleTransaction(transaction) {
    }

    function requestHandler(path, handler) {
        // TODO: check handler doesn't already exist
        // handlers.OPTIONS[path] = getOptionsRequestHandler();
        handlers.REQMOD[path] = getHandler();
    }

    function getOptionsRequestHandler() {
        return function() {
        };
    }

    function getHandler() {
        return function() {
        };
    }
};

function sanitizeRequestHeaders(headers, icapRequest) {
    if (!headers) {
        if (!icapRequest.hasRequestHeaders()) {
            return;
        }
    }
}

function sanitizeResponseHeaders(headers, icapRequest) {
    if (!headers && !icapRequest.hasResponseHeaders()) {
        return;
    }
}

function sanitizeRequestBody(body, icapRequest) {
    if (!body && !icapRequest.hasRequestBody()) {
        return;
    }
}

function sanitizeResponseBody(body, icapRequest) {
    if (!body && !icapRequest.hasResponseBody()) {
        return;
    }
}
