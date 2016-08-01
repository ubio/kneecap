KC = kneecap

# Testing

```
npm test
```

# How it works

A KC instance allows a single endpoint per http request/response, hardcoded `/request` or `/response`.

A single callback can be attached to each endpoint, which must return a promise.

## Examples

### Change request headers

```js
        icapServer.requestHandler('/request', function(request) {
            return request.getRequestHeaders()
                .then(headers => {
                    return {
                        requestHeaders: headers.replace(myHeaderName, `${myHeaderName}-Changed`)
                    };
                });
        });
```

### Change request body

```js
        icapServer.requestHandler('/request', function(request) {
            return Promise.all([request.getRequestHeaders(), request.getRawBody()])
                .then(results => {
                    const [requestHeaders, requestBody] = results;
                    const diff = expectedBodyValue.length - myFormValue.length;
                    const oldContentLength = Number(requestHeaders.match(/content-length: (\d+)/i)[1]);
                    return {
                        requestBody: Buffer.from(requestBody.toString().replace(myFormValue, expectedBodyValue)),
                        requestHeaders: requestHeaders.replace(/content-length: (\d+)/i, `Content-Length: ${oldContentLength + diff}`)
                    };
                });
        });
```

