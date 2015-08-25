var isarray = require('isarray');

var VERSION = '1.0.0';

module.exports = RPC;

function RPC (src, dst, origin, methods) {
    if (!(this instanceof RPC)) return new RPC(src, dst, origin, methods);
    var self = this;
    this.src = src;
    this.dst = dst;
    
    if (origin === '*') {
        this.origin = '*';
    }
    else {
        var uorigin = new URL(origin);
        this.origin = uorigin.protocol + '//' + uorigin.host;
    }
    
    this._sequence = 0;
    this._callbacks = {};
    
    this._onmessage = function (ev) {
        if (self._destroyed) return;
        if (self.origin !== '*' && ev.origin !== self.origin) return;
        if (!ev.data || typeof ev.data !== 'object') return;
        if (ev.data.protocol !== 'frame-rpc') return;
        if (!isarray(ev.data.arguments)) return;
        self._handle(ev.data);
    };
    this.src.addEventListener('message', this._onmessage);
    this._methods = (typeof methods === 'function'
        ? methods(this)
        : methods
    ) || {};
}

RPC.prototype.destroy = function () {
    this._destroyed = true;
    this.src.removeEventListener('message', this._onmessage);
};

RPC.prototype.call = function (method) {
    var args = [].slice.call(arguments, 1);
    return this.apply(method, args);
};

RPC.prototype.apply = function (method, args) {
    if (this._destroyed) return;
    var seq = this._sequence ++;
    if (typeof args[args.length - 1] === 'function') {
        this._callbacks[seq] = args[args.length - 1];
        args = args.slice(0, -1);
    }
    this.dst.postMessage({
        protocol: 'frame-rpc',
        version: VERSION,
        sequence: seq,
        method: method, 
        arguments: args
    }, this.origin);
};

RPC.prototype._handle = function (msg) {
    var self = this;
    if (self._destroyed) return;
    if (msg.hasOwnProperty('method')) {
        if (!this._methods.hasOwnProperty(msg.method)) return;
        var args = msg.arguments.concat(function () {
            self.dst.postMessage({
                protocol: 'frame-rpc',
                version: VERSION,
                response: msg.sequence,
                arguments: [].slice.call(arguments)
            }, self.origin);
        });
        this._methods[msg.method].apply(this._methods, args);
    }
    else if (msg.hasOwnProperty('response')) {
        var cb = this._callbacks[msg.response];
        delete this._callbacks[msg.response];
        if (cb) cb.apply(null, msg.arguments);
    }
};
