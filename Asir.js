// const fs = require("fs");
// const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require("node:constants");
// const log = fs.openSync("c:\\Users\\sakur\\asir-syntax-highlight\\logs\/log.txt", "w");
const util = require("util");

/*
function languageServer() {
 process.stdin.on("readable", () => {
  const s = JSON.stringify({ jsonrpc: "2.0", method: "window/logMessage", params: { type: 3, message: "Hello, World!" }});
  process.stdout.write(`Content-Length: ${s.length}\r\n\r\n${s}`);
 });
}
*/

// run
if (process.argv.length !== 3) {
 console.log(`usage: ${process.argv[1]} [--language-server|FILE]`);
} else if (process.argv[2] == "--language-server") {
 languageServer();
} else {
 // TODO: interpret(process.argv[2]);
}

// send messages
function sendMessage(msg) {
 const s = new util.TextEncoder().encode(JSON.stringify(msg));
 process.stdout.write(`Content-Length: ${s.length}\r\n\r\n`);
 process.stdout.write(s);
}

function logMessage(message) {
 sendMessage({ jsonrpc: "2.0", method: "window/logMessage", params: { type: 3, message } });
}

// receive message
function sendErrorResponse(id, code, message) {
 sendMessage({ jsonrpc: "2.0", id, error: { code, message }});
}


function sendParseErrorResponse() {
 // If there was an error in detecting the id in the Request object (e.g. Parse error/Invalid Request), it MUST be Null.
 // https://www.jsonrpc.org/specification#response_object
 sendErrorResponse(null, -32700, "received an invalid JSON");
}

// main
function languageServer() {
 let buffer = Buffer.from(new Uint8Array(0));
 process.stdin.on("readable", () => {
  let chunk;
  while (chunk = process.stdin.read()) {
   buffer = Buffer.concat([buffer, chunk]);
  }

  const bufferString = buffer.toString();
  if (!bufferString.includes("\r\n\r\n")) return;

  const headerString = bufferString.split("\r\n\r\n", 1)[0];

  let contentLength = -1;
  let headerLength = headerString.length + 4;
  for (const line of headerString.split("\r\n")) {
   const [key, value] = line.split(": ");
   if (key === "Content-Length") {
    contentLength = parseInt(value, 10);
   }
  }

  if (contentLength === -1) return;
  if (buffer.length < headerLength + contentLength) return;

  try {
   const msg = JSON.parse(buffer.slice(headerLength, headerLength + contentLength).toString());
   dispatch(msg); // 後述
  } catch (e) {
   if (e instanceof SyntaxError) {
    sendParseErrorResponse();
    return;
   } else {
    throw e;
   }
  } finally {
   buffer = buffer.slice(headerLength + contentLength);
  }
 });
}

function sendInvalidRequestResponse() {
 sendErrorResponse(null, -32600, "received an invalid request");
}

function sendMethodNotFoundResponse(id, method) {
 sendErrorResponse(id, -32601, method + " is not supported");
}

// initialize
const requestTable = {};
const notificationTable = {};
let publishDiagnosticsCapable = false;

requestTable["initialize"] = (msg) => {
 if (msg.params && msg.params.capabilities) {
  if (msg.params.capabilities.textDocument && msg.params.capabilities.textDocument.publishDiagnostics) {
   publishDiagnosticsCapable = true;
  }
 }

 const capabilities = {
  textDocumentSync: 1,
  definitionProvider: true
 };

 sendMessage({
  jsonrpc: "2.0",
  id: msg.id,
  result: {capabilities}
 });
}

notificationTable["initialized"] = (msg) => {
 logMessage("initialized!");
}

function dispatch(msg) {
 if ("id" in msg && "method" in msg) { // request
  if (msg.method in requestTable) {
   requestTable[msg.method](msg);
  } else {
   sendMethodNotFoundResponse(msg.id, msg.method)
  }
 } else if ("id" in msg) { // response
  // Ignore.
  // This language server doesn't send any request.
  // If this language server receives a response, that is invalid.
 } else if ("method" in msg) { // notification
  if (msg.method in notificationTable) {
   notificationTable[msg.method](msg);
  }
 } else { // error
  sendInvalidRequestResponse();
 }
}

// Diagnostic
function sendPublishDiagnostics(uri, diagnostics) {
 if (publishDiagnosticsCapable) {
  sendMessage({
   jsonrpc: "2.0",
   method: "textDocument/publishDiagnostics",
   params: {uri, diagnostics}
  });
 }
}

const buffers = {};
const diagnostics = [];

// Text Document Synchronization
function compile(uri, src) {
 // tokenize
 diagnostics.length = 0;
 const tokens = tokenize(uri, src);
 const pts = parse(tokens.filter(t => t.kind !== "comment"));
 const defList = expandDef(pts);
 buffers[uri] = { tokens, pts, defList };
}

notificationTable["textDocument/didOpen"] = (msg) => {
 const uri = msg.params.textDocument.uri;
 const text = msg.params.textDocument.text;
 compile(uri, text);
 sendPublishDiagnostics(uri, diagnostics);
}

notificationTable["textDocument/didChange"] = (msg) => {
  if (msg.params.contentChanges.length !== 0) {
  const uri = msg.params.textDocument.uri;
  const text = msg.params.contentChanges[msg.params.contentChanges.length - 1].text;
  compile(uri, text);
  sendPublishDiagnostics(uri, diagnostics);
 }
}

notificationTable["textDocument/didClose"] = (msg) => {
 const uri = msg.params.textDocument.uri;
 sendPublishDiagnostics(uri, []);
}

function tokenize(uri, str) {
 let i = 0;
 let line = 0;
 let character = 0;
 let tokens = [];

 function nextChar() {
  if (str.length === i) return;
  if (str[i] === "\n") {
   ++i;
   ++line;
   character = 0;
  } else {
   ++i;
   ++character;
  }
 }

 while (true) {
  // skip leading whitespaces
  while (true) {
   if (str.length === i) return tokens;
   if (" \t\r\n".indexOf(str[i]) === -1) break;
   nextChar();
  }

  const start = { line, character };

  let text;
  let kind;
  if (str[i] === "{") {
   text = "{";
   kind = "{";
   nextChar();
  } else if (str[i] === "}") {
   text = "}";
   kind = "}";
   nextChar();
  } else if (str[i] === "(") {
    text = "(";
    kind = "(";
    nextChar();
  } else if (str[i] === ")") {
    text = ")";
    kind = ")";
    nextChar();
  } else if (str[i] === ";") {
   text = ";";
   kind = ";";
   nextChar();
  } else if (str[i] === "$") {
   text = "$";
   kind = "$";
   nextChar();
  } else if (str[i] === "/" && str[i+1] === "/") {
   const begin = i;
   while (true) {
    if (str.length === i) break;
    if (str[i] === "\n") break;
    nextChar();
   }
   text = str.substring(begin, i);
   kind = "comment";
  } else if (str[i] === "/" && str[i+1] === "*") {
   const begin = i;
   while (true) {
    if (str.length === i) break;
    if (str[i-2] === "*" && str[i-1] === "/") break;
    nextChar();
   }
   text = str.substring(begin, i);
   kind = "comment";
  } else {
   const begin = i;
   while (true) {
    if (str.length === i) break;
    if (" \t\r\n{}();$".indexOf(str[i]) !== -1) break;
    nextChar();
   }
   text = str.substring(begin, i);

   if (!isNaN(Number(text))) {
    kind = "number";
   } else if (text === "def") {
    kind = "def";
   } else {
    kind = "variable";
   }
  }

  const end = { line, character };
  const location = { uri, range: { start, end } };
  tokens.push({ kind, text, location });
 }
}

// parse
function parse(tokens) {
 const pts = [];
 let i = 0;

 function parse1() {
  switch (tokens[i].kind) {
   case "{":
    {
     const data = [];
     const firstToken = tokens[i++];
     while (true) {
      if (tokens.length === i) {
       diagnostics.push({
        range: firstToken.location.range,
        message: "unclosed parenthesis"
       });
       break;
      } else if (tokens[i].kind === "}") {
       ++i;
       break;
      } else {
       data.push(parse1());
      }
     }
     const lastToken = tokens[i - 1];
     return { kind: "array", firstToken, lastToken, data };
    }
   case "}":
    {
     const token = tokens[i++];
     diagnostics.push({
      range: token.location.range,
      message: "extra close parenthesis"
     });
     return { kind: "error", firstToken: token, lastToken: token };
    }
   case "(":
    {
     const data = [];
     const firstToken = tokens[i++];
     while (true) {
      if (tokens.length === i) {
       diagnostics.push({
        range: firstToken.location.range,
        message: "unclosed parenthesis"
       });
       break;
      } else if (tokens[i].kind === ")") {
       ++i;
       break;
      } else {
       data.push(parse1());
      }
     }
     const lastToken = tokens[i - 1];
     return { kind: "array", firstToken, lastToken, data };
    }
   case ")":
    {
     const token = tokens[i++];
     diagnostics.push({
      range: token.location.range,
      message: "extra close parenthesis"
     });
     return { kind: "error", firstToken: token, lastToken: token };
    }
   case "number":
    {
     const token = tokens[i++];
     return { kind: "number", firstToken: token, lastToken: token, value: Number(token.text) };
    }
   case "variable":
    {
     const token = tokens[i++];
     return { kind: "variable", firstToken: token, lastToken: token, text: token.text };
    }
   case "def":
    {
     const token = tokens[i++];
     return { kind: "def", firstToken: token, lastToken: token, text: token.text };
    }
   case ";":
    {
     const token = tokens[i++];
     return { kind: ";", firstToken: token, lastToken: token, text: token.text };
    }
   case "$":
    {
     const token = tokens[i++];
     return { kind: "$", firstToken: token, lastToken: token, text: token.text };
    }
  }
 }

 while (true) {
     if (tokens.length === i) return pts;
     pts.push(parse1());
 }
}

// find definition
function expandDef(pts) {
  const defList = [];
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].kind === "def" && pts[i+1].kind === "variable") {
      defList.push(pts[i+1]);
    }
  }

  return defList;
}

// go to definition
requestTable["textDocument/definition"] = (msg) => {
  const uri = msg.params.textDocument.uri;
  const position = msg.params.position;
  
  const ast = findAstOfPosition(uri, position);
  if (ast === null) {
   sendMessage({jsonrpc: "2.0", id: msg.id, result: null});
  } else {
   sendMessage({jsonrpc: "2.0", id: msg.id, result: ast}); 
  }
}

function positionInRange(uri, position) {
 for (let i = 0; i < buffers[uri].pts.length; i++) {
  var pt = buffers[uri].pts[i];
  if (pt.kind === "array") {
   var a = forArray(pt.data, position);
   if (a !== null) return a;
  } else if (buffers[uri].pts[i].firstToken.location.range.start.line === position.line && buffers[uri].pts[i].firstToken.location.range.start.character <= position.character && buffers[uri].pts[i].firstToken.location.range.end.character >= position.character) {
   return buffers[uri].pts[i].text;
  }
 }
 return null;
}

function forArray(array, position) {
 for (let j = 0; j < array.length; j++) {
  if (array[j].kind === "array") {
   var a = forArray(array[j].data, position);
   if (a !== null) return a;
  }
  var range = array[j].firstToken.location.range;
  if (range.start.line === position.line && range.start.character <= position.character && range.end.character >= position.character) {
   return array[j].text;
  }
 }
 return null;
}

function findAstOfPosition(uri, position) {
 const cost = positionInRange(uri, position);
 if (cost === null) return null;
 for (let i = 0; i < buffers[uri].defList.length; i++) {
  if (buffers[uri].defList[i].text === cost) {
   return buffers[uri].defList[i].firstToken.location;
  }
 }
 return null; 
}

module.exports = {positionInRange, forArray, findAstOfPosition, completion}; // use in extension.js

// completion
function completion(uri) {
  const defList = buffers[uri].defList;
  const result = [];

  for (let i = 0; i < defList.length; i++) {
    result.push({label: defList[i].text})
  }

  return result;
}