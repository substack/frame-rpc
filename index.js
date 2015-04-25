'use strict';
var has = require('has');
var isarray = require('isarray');
var events = require('add-event-listener');

var VERSION = '1.0.0';

module.exports = RPC;

function RPC (src, dst, origin, methods) {
    if (!(this instanceof RPC)) return new RPC(src, dst, origin, methods);
    var self = this;
    this.src = src;
    this.dst = dst;
    this.origin = origin;
    if (this.origin !== '*' && typeof URL !== 'undefined') {
        var uorigin = new URL(origin);
        this.origin = uorigin.protocol + '//' + uorigin.host;
    }

    this._methods = methods || {};
    this._sequence = 0;
    this._callbacks = {};

    this._onmessage = function (ev) {
        var data = {};
        if (self._destroyed) return;
        if (self.origin !== '*' && ev.origin !== self.origin) return;
        if (!ev.data || typeof ev.data !== 'string') return;
        try {
            data = JSON.parse(ev.data);
        } catch (e) {
            data = {};
        }
        if (data.protocol !== 'frame-rpc') return;
        if (!isarray(data.arguments)) return;
        self._handle(data);
    };
    events.addEventListener(this.src, 'message', this._onmessage);
}

RPC.prototype.destroy = function () {
    this._destroyed = true;
    events.removeEventListener(this.src, 'message', this._onmessage);
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
    this._send({
        protocol: 'frame-rpc',
        version: VERSION,
        sequence: seq,
        method: method,
        arguments: args
    });
};

RPC.prototype._send = function (object) {
    this.dst.postMessage(JSON.stringify(object), this.origin);
};

RPC.prototype._handle = function (msg) {
    var self = this;
    if (self._destroyed) return;
    if (has(msg, 'method')) {
        if (!has(this._methods, msg.method)) return;
        var args = msg.arguments.concat(function () {
            self._send({
                protocol: 'frame-rpc',
                version: VERSION,
                response: msg.sequence,
                arguments: [].slice.call(arguments)
            });
        });
        this._methods[msg.method].apply(this._methods, args);
    }
    else if (has(msg, 'response')) {
        var cb = this._callbacks[msg.response];
        delete this._callbacks[msg.response];
        if (cb) cb.apply(null, msg.arguments);
    }
};
