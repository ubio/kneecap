'use strict';

const DEFAULT_TIMEOUT = 60000;

/**
 * A convenient interface for reading chunked data from socket.
 *
 * Upon instantiation reader will listen for socket `data` events
 * and will buffer everything.
 *
 * Use `readUpTo` to wait for specific buffer of interest
 * (`consume` function should return an index up to where
 * the buffer is expected to be consumed).
 *
 * When reader no longer needed use `close` to free the resources.
 *
 * @param socket {net.Socket}
 * @param timeout {number}
 */
module.exports = function createSocketReader(socket, timeout) {
    timeout = timeout || DEFAULT_TIMEOUT;

    let remaining = Buffer.alloc(0);
    let currentRead = null;

    socket.addListener('data', onData);
    socket.addListener('close', close);

    return {
        readUpTo,
        flush,
        close
    };

    /**
     * Reads data from socket up to the non-negative index (inclusive!)
     * returned from `consume(receivedBuffer)` function. 
     * 
     * Imagine socket receives data in four chunks:
     *
     * ```
     * "hello, "
     * "world!"
     * "\nStart of "
     * "new message\n"
     * ```
     * 
     * Here's how to get "hello, world!" message:
     * 
     * ```
     * // will resolve 'hello, world!' buffer after socket receives first 3 chunks
     * reader.readUpTo(buf => buf.indexOf(Buffer.from('\n')));
     * ```
     * 
     * Calling the same again will resolve `\nStart of new message` buffer.
     * 
     * @param consume {Buffer => number}
     * @returns {Promise<Buffer>}
     */
    function readUpTo(consume) {
        if (currentRead) {
            currentRead.reject(
                new Error('Socket reader only allows single read at a time'));
        }
        return new Promise((_resolve, _reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Socket reader timeout'));
            }, timeout);

            currentRead = {
                notify,
                resolve,
                reject
            };

            function resolve(value) {
                _resolve(value);
                cleanup();
            }

            function reject(err) {
                _reject(err);
                cleanup();
            }
            
            function notify() {
                const idx = consume(remaining);
                if (idx > -1) {
                    const result = remaining.slice(0, idx + 1);
                    remaining = remaining.slice(idx + 1);
                    resolve(result);
                }
            }
            
            function cleanup() {
                clearTimeout(timer);
                currentRead = null;
            }

            // check current stuff immediately
            notify();
        });

    }
    
    function flush() {
        const result = remaining;
        remaining = Buffer.alloc(0);
        return result;
    }

    function close() {
        socket.removeListener('data', onData);
        socket.removeListener('close', close);
        if (currentRead) {
            currentRead.reject(new Error('Socket reader closed'));
        }
    }

    function onData(data) {
        remaining = Buffer.concat([remaining, data]);
        if (currentRead) {
            currentRead.notify();
        }
    }

};
