KC = kneecap

# Testing

```
npm test
```

# How it works

A KC instance only allows separate endpoints per http request/response. A single callback can be attached to each endpoint, which must return a promise.

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

### Don't change anything

```js
        icapServer.requestHandler('/request', function(request) {
            return Promise.all([request.getRequestHeaders(), request.getRawBody()])
                .then(results => {
                    const [requestHeaders, requestBody] = results;
                    console.log('Got request', requestHeaders, requestBody);
                    return;
                });
        });
```

### Set request options

```js
        icapServer.requestHandler('/request', {
            previewBytes: 128,
            transfer: {
                complete: ['html', 'js'],
                ignore: ['jpg', 'ogg', 'mp4', 'gif', 'gifv'],
                preview: ['*'],
            }
        }, function(request) {
            return Promise.resolve(request.getPreview())
                .then(previewBody => {
                    console.log('preview', previewBody.toString());
                });
        });
```

## Gotchas

- You should make sure `headers['content-length']` is valid (or removed) when changing the request's (or response's) body, otherwise the data may end up truncated.
- Getting the preview is a lot faster than getting the full body. Use `request.getPreivew()` where possible.
