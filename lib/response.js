'use strict';

module.exports = function responseConstructor(data) {

    const statusCode = data.statusCode; // Number
    const statusText = data.statusText; // String
    const icapHeaders = data.icapHeaders; // Map
    const payload = data.payload; // Map

    return Object.freeze({
        toString
    });

    function toString() {
        const lines = [];

        /**
         * ICAP responses MUST start with an ICAP status line, similar in form
         * to that used by HTTP, including the ICAP version and a status code.
         * For example:
         *
         * ICAP/1.0 200 OK
         */
        const line1 = `ICAP/1.0 ${statusCode} ${statusText}`;
        lines.push(line1);

        icapHeaders.forEach((value, key) => {
            const line = `${key}: ${value}`;
            lines.push(line);
        });

        /**
         * 4.4.1  The "Encapsulated" Header
         *
         * The offset of each encapsulated section's start relative to the start
         * of the encapsulating message's body is noted using the "Encapsulated"
         * header.  This header MUST be included in every ICAP message.  For
         * example, the header
         *
         * Encapsulated: req-hdr=0, res-hdr=45, res-body=100
         *
         * indicates a message that encapsulates a group of request headers, a
         * group of response headers, and then a response body.  Each of these
         * is included at the byte-offsets listed.  The byte-offsets are in
         * decimal notation for consistency with HTTP's Content-Length header.
         *
         * The special entity "null-body" indicates there is no encapsulated
         * body in the ICAP message.
         *
         * The syntax of an Encapsulated header is:
         *
         * encapsulated_header: "Encapsulated: " encapsulated_list
         * encapsulated_list: encapsulated_entity |
         * encapsulated_entity ", " encapsulated_list
         * encapsulated_entity: reqhdr | reshdr | reqbody | resbody | optbody
         * reqhdr  = "req-hdr" "=" (decimal integer)
         * reshdr  = "res-hdr" "=" (decimal integer)
         * reqbody = { "req-body" | "null-body" } "=" (decimal integer)
         * resbody = { "res-body" | "null-body" } "=" (decimal integer)
         * optbody = { "opt-body" | "null-body" } "=" (decimal integer)
         *
         * There are semantic restrictions on Encapsulated headers beyond the
         * syntactic restrictions.  The order in which the encapsulated parts
         * appear in the encapsulating message-body MUST be the same as the
         * order in which the parts are named in the Encapsulated header.  In
         * other words, the offsets listed in the Encapsulated line MUST be
         * monotonically increasing.  In addition, the legal forms of the
         * Encapsulated header depend on the method being used (REQMOD, RESPMOD,
         * or OPTIONS).  Specifically:
         *
         * REQMOD  request  encapsulated_list: [reqhdr] reqbody
         * REQMOD  response encapsulated_list: {[reqhdr] reqbody} |
         *                                     {[reshdr] resbody}
         * RESPMOD request  encapsulated_list: [reqhdr] [reshdr] resbody
         * RESPMOD response encapsulated_list: [reshdr] resbody
         * OPTIONS response encapsulated_list: optbody
         *
         * In the above grammar, note that encapsulated headers are always
         * optional.  At most one body per encapsulated message is allowed.  If
         * no encapsulated body is presented, the "null-body" header is used
         * instead; this is useful because it indicates the length of the header
         * section.
         *
         * Examples of legal Encapsulated headers:
         *
         * * REQMOD request: This encapsulated HTTP request's headers start
         * * at offset 0; the HTTP request body (e.g., in a POST) starts
         * * at 412.
         * Encapsulated: req-hdr=0, req-body=412
         *
         * * REQMOD request: Similar to the above, but no request body is
         * * present (e.g., a GET).  We use the null-body directive instead.
         * * In both this case and the previous one, we can tell from the
         * * Encapsulated header that the request headers were 412 bytes
         * * long.
         * Encapsulated: req-hdr=0, null-body=412
         *
         * * REQMOD response: ICAP server returned a modified request,
         * * with body
         * Encapsulated: req-hdr=0, req-body=512
         *
         * * RESPMOD request: Request headers at 0, response headers at 822,
         * * response body at 1655.  Note that no request body is allowed in
         * * RESPMOD requests.
         * Encapsulated: req-hdr=0, res-hdr=822, res-body=1655
         *
         * * RESPMOD or REQMOD response: header and body returned
         * Encapsulated: res-hdr=0, res-body=749
         *
         * * OPTIONS response when there IS an options body
         * Encapsulated: opt-body=0
         *
         * OPTIONS response when there IS NOT an options body
         * Encapsulated: null-body=0
         */
        const encapsulatedData = getEncapsulatedData(payload);
        const encapsulatedHeaderValue = encapsulatedData.headerValue;
        const encapsulatedPayload = encapsulatedData.payload;
        const encapsulatedLine = `Encapsulated: ${encapsulatedHeaderValue}`;
        lines.push(encapsulatedLine);

        if (encapsulatedPayload.length > 0) {
            const response = `${lines.join('\r\n')}\r\n\r\n${encapsulatedPayload}\r\n\r\n`;
            return response;
        }
        const response = `${lines.join('\r\n')}\r\n\r\n`;
        return response;

        lines.push('');
        return lines.join('\r\n');
    }
};

const ENCAPSULATED_HEADERS = ['req-hdr', 'res-hdr'];
const ENCAPSULATED_BODIES = ['opt-body', 'req-body', 'res-body'];
const ENCAPSULATED_TAGS = ENCAPSULATED_HEADERS.concat(ENCAPSULATED_BODIES);

function getEncapsulatedData(payload) {
    const encapsulatedData = {
        headerValue : '',
        payload : '',
    };
    let foundBody = false;
    ENCAPSULATED_TAGS.forEach(tag => {
        if (payload.has(tag)) {
            addEncapsulatedPayload(encapsulatedData, tag, payload.get(tag));
            if (ENCAPSULATED_BODIES.includes(tag)) {
                foundBody = true;
            }
        }
    });
    if (!foundBody) {
        encapsulatedData.headerValue = `${encapsulatedData.headerValue} null-body=${encapsulatedData.payload.length}`.trim();
    }
    return encapsulatedData;
}

const PAYLOAD_SEPARATOR = '\r\n\r\n';

function addEncapsulatedPayload(encapsulatedData, tag, data) {
    if (encapsulatedData.payload.length > 0) {
        encapsulatedData.payload += PAYLOAD_SEPARATOR;
    }
    const ix = encapsulatedData.payload.length;
    encapsulatedData.payload  = `${encapsulatedData.payload}${PAYLOAD_SEPARATOR}${data.trim()}`.trim();
    if (encapsulatedData.headerValue.length > 0) {
        encapsulatedData.headerValue += ', ';
    }
    encapsulatedData.headerValue = `${encapsulatedData.headerValue}${tag}=${ix}`;
}
