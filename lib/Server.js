'use strict';

const net = require('net');
const connectionHandler = require('./connection.js');

class Server extends net.Server {
    constructor(...args) {
        const server = super(...args);
        server.on('connection', socket => {
            server._handleConnection(socket);
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
                self.removeListener('listening', onListening);
                resolve(self);
            }
        });
    }

    _handleConnection(socket) {
        const connection = connectionHandler(socket);
        connection.events.on('session', icapSession => {
            console.log('server got icapSession', icapSession);
        });
    }
}

module.exports = Server;
