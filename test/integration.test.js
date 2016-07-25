'use strict';

const PROXY_PORT = 8000; // Must be the same as http_port in test/squid.conf
const ICAP_PORT = 8001; // Must be the same as icap_service in test/squid.conf

const childProcess = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');
const request = require('request');
const should = require('should');
should;
const kneecap = require('../index.js');

describe('integration', () => {
    let _server, _proxyPid, icapServer;
    let waitForRequest = Promise.reject(new Error('waitForRequest not changed'));

    function rGET(headers) {
        return request({
            url: `http://localhost:${_server.address().port}/`,
            proxy: `http://localhost:${PROXY_PORT}/`,
            headers
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
                waitForRequest = new Promise(resolve => {
                    server.on('request', (req, res) => {
                        resolve({req, res});
                    });
                });
            });
    });
    afterEach(() => {
        waitForRequest = Promise.reject(new Error('waitForRequest not set'));
        icapServer.removeRequestModifier();
        return closeHttpServer(_server)
            .then(() => {
                _server = null;
            });
    });
    after(() => {
        return stopProxy(_proxyPid);
    });

    it('should forward requests untouched', () => {
        const myHeaderName = 'X-Change-Me';
        const myHeaderValue = 'my-test-header';
        const headers = {};
        headers[myHeaderName] = myHeaderValue;
        icapServer.removeRequestModifier();
        rGET(headers);
        return Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();

                req.headers[myHeaderName.toLowerCase()].should.equal(myHeaderValue);
            });
    });

    it('should change request headers', () => {
        const myHeaderName = 'X-Change-Me';
        const myHeaderValue = 'my-test-header';
        const headers = {};
        headers[myHeaderName] = myHeaderValue;
        icapServer.setRequestModifier(function(request) {
            const reqHeaders = request.getRequestHeaders();
            return {
                reqHeaders: reqHeaders.replace(myHeaderName, `${myHeaderName}-Changed`)
            };
        });
        rGET(headers);
        return Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();

                should.not.exist(req.headers[myHeaderName.toLowerCase()]);
            });
    });

    it('should change request header values', () => {
        const myHeaderName = 'X-Change-Me';
        const myHeaderValue = 'my-test-header-value';
        const headers = {};
        headers[myHeaderName] = myHeaderValue;
        icapServer.setRequestModifier(function(request) {
            const reqHeaders = request.getRequestHeaders();
            return {
                reqHeaders: reqHeaders.replace(myHeaderValue, 'my-changed-header-value')
            };
        });
        rGET(headers);
        return Promise.resolve(waitForRequest)
            .then(result => {
                const req = result.req;
                const res = result.res;
                res.destroy();

                const expectedHeaderValue = 'my-changed-header-value';
                req.headers[myHeaderName.toLowerCase()].should.equal(expectedHeaderValue);
            });
    });
});

function createIcapServer() {
    return Promise.resolve(kneecap(ICAP_PORT));
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
        connection.connect(port);
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
        connection.connect(port);
        connection.on('error', reject);
        connection.on('connect', () => {
            resolve();
            connection.end();
        });
    });
}

function stopProxy(pid) {
    childProcess.spawn('kill', ['-2', pid]);
    return waitForPortNotListening(PROXY_PORT);
}

function promiseTimeout(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

