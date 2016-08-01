'use strict';

const PROXY_PORT = 8000; // Must be the same as http_port in test/squid.conf
const ICAP_PORT = 8001; // Must be the same as icap_service in test/squid.conf

const PROXY_HOST = 'localhost';
// const PROXY_HOST = '192.168.99.100';

// const PROXY_URL = `http://localhost:${PROXY_PORT}/`;
const PROXY_URL = `http://${PROXY_HOST}:${PROXY_PORT}/`;

const childProcess = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');
// const qs = require('querystring');
const request = require('request');
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({
    extended: false
});
const should = require('should');
should;
// const kneecap = require('../index.js');
const kneecap = require('../src/server.js');

describe('http-request', () => {
    let _server, _proxyPid, icapServer;
    let waitForRequest = Promise.reject(new Error('waitForRequest not changed'));

    function initializeWaitForRequest(server) {
        waitForRequest = new Promise(resolve => {
            server.on('request', (req, res) => {
                urlencodedParser(req, res, () => {
                    resolve([req, res]);
                });
            });
        });
    }

    function makeRequest(method, headers, form) {
        return request({
            url: `http://localhost:${_server.address().port}/`,
            proxy: PROXY_URL,
            method,
            headers,
            form
        }, err => {
            err && console.log('request error', err);
        });
    }

    before(() => {
        return createIcapServer()
            .then(server => {
                icapServer = server;
                return startProxy();
            })
            .then(proxyPid => {
                _proxyPid = proxyPid;
            });
    });
    beforeEach(() => {
        return getListeningHttpServer()
            .then(server => {
                _server = server;
                initializeWaitForRequest(server);
            });
    });
    afterEach(() => {
        waitForRequest = Promise.reject(new Error('waitForRequest not set'));
        return closeHttpServer(_server)
            .then(() => {
                _server = null;
            });
    });
    after(() => {
        return stopProxy(_proxyPid);
    });

    it('should be an IncomingMessage', done => {
        const form = {
            key: 'value'
        };
        icapServer.requestHandler('/request', function(request) {
            return request.getRequest()
                .then(req => {
                    req.constructor.name.should.equal('IncomingMessage');
                    done();
                })
                .catch(done);
        });
        makeRequest('POST', undefined, form);
    });

    it('should contain form data', done => {
        const form = {
            key: 'value'
        };
        icapServer.requestHandler('/request', function(request) {
            return request.getRequest()
                .then(req => {
                    urlencodedParser(req, {}, () => {
                        req.body.key.should.equal('value');
                        done();
                    });
                })
                .catch(done);
        });
        makeRequest('POST', undefined, form);
        Promise.resolve(waitForRequest)
            .then(results => {
                const [req, res] = results;
                console.log('test got http result', !!req, !!res);
            });
    });
});

// function getLargeObject(length = 99) {
//     return Array.from({length}).reduce((prev, _, ix) => (prev['k' + ix] = 'value'.repeat(length)) && prev, {});
// }

function createIcapServer() {
    return Promise.resolve()
        .then(() => {
            const server = kneecap();
            server.listen(ICAP_PORT);
            return new Promise(resolve => setTimeout(() => resolve(server), 500));
        });
    // return Promise.resolve(kneecap(ICAP_PORT));
}

function getListeningHttpServer() {
    return Promise.resolve()
        .then(() => {
            const server = http.createServer();
            server.listen(0);
            return new Promise(resolve => {
                server.on('listening', () => resolve(server));
            });
        });
}

function closeHttpServer(server) {
    return Promise.resolve(server)
        .then((server) => {
            if (server) {
                return new Promise(resolve => {
                    server.close(resolve);
                });
            }
        });
}

function startProxy() {
    const configPath = path.join(__dirname, 'squid.conf');
    const proc = childProcess.spawn('squid3', ['-N', '-f', configPath, '-a', PROXY_PORT]);
    // const proc = childProcess.spawn('docker',
    //     ['run', '--net=host', '--name=roxi-squid', 'universalbasket/roxi-squid']);
    return Promise.resolve(proc)
        .then(proc => {
            return waitForPortListening(PROXY_PORT)
                .then(() => proc.pid);
        });
}

function waitForPortListening(port) {
    return retry(0);

    function retry(attempt) {
        if (attempt > 50) {
            const err = new Error('waitForPortListening attempts limit reached');
            throw err;
        }
        return assertPortListening(port)
            .catch(() => {
                return promiseTimeout(100)
                    .then(() => {
                        return retry(attempt + 1);
                    });
            });
    }
}

function waitForPortNotListening(port) {
    return retry(0);

    function retry(attempt) {
        if (attempt > 50) {
            const err = new Error('waitForPortNotListening attempts limit reached');
            throw err;
        }
        return assertPortNotListening(port)
            .catch(() => {
                return promiseTimeout(100)
                    .then(() => {
                        return retry(attempt + 1);
                    });
            });
    }
}

function assertPortNotListening(port) {
    return new Promise((resolve, reject) => {
        const connection = new net.Socket();
        connection.connect(port, PROXY_HOST);
        connection.on('error', resolve);
        connection.on('connect', () => {
            reject();
            connection.end();
        });
    });
}

function assertPortListening(port) {
    return new Promise((resolve, reject) => {
        const connection = new net.Socket();
        connection.connect(port, PROXY_HOST);
        connection.on('error', reject);
        connection.on('connect', () => {
            resolve();
            connection.end();
        });
    });
}

function stopProxy(pid) {
    childProcess.spawn('kill', ['-2', pid]);
    childProcess.spawn('docker', ['rm', '-f', 'roxi-squid']);
    return waitForPortNotListening(PROXY_PORT);
}

function promiseTimeout(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

