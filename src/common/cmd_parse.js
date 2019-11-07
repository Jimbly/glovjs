// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const { isInteger } = require('./util.js');

function canonical(cmd) {
  return cmd.toLowerCase().replace(/[_.]/g, '');
}

export const TYPE_INT = 0;
export const TYPE_FLOAT = 1;
export const TYPE_STRING = 2;
const TYPE_NAME = ['INTEGER', 'NUMBER', 'STRING'];

export function defaultHandler(err, resp) {
  if (err) {
    console.error(err, resp);
  } else {
    console.info(resp);
  }
}

function CmdParse(params) {
  this.cmds = {};
  this.was_not_found = false;
  this.storage = params && params.storage; // expects .setJSON(), .getJSON()
  this.default_handler = defaultHandler;
}
CmdParse.prototype.setDefaultHandler = function (fn) {
  assert(this.default_handler === defaultHandler); // Should only set this once
  this.default_handler = fn;
};
CmdParse.prototype.handle = function (self, str, resp_func) {
  resp_func = resp_func || this.default_handler;
  this.was_not_found = false;
  let m = str.match(/^([^\s]+)(?:\s+(.*))?$/);
  if (!m) {
    resp_func('Missing command');
    return true;
  }
  let cmd = canonical(m[1]);
  if (!this.cmds[cmd]) {
    this.was_not_found = true;
    resp_func(`Unknown command: "${m[1]}"`);
    return false;
  }
  this.cmds[cmd].call(self, m[2] || '', resp_func);
  return true;
};

CmdParse.prototype.register = function (cmd, func) {
  this.cmds[canonical(cmd)] = func;
};

CmdParse.prototype.registerValue = function (cmd, param) {
  assert(TYPE_NAME[param.type] || !param.set);
  assert(param.set || param.get);
  let label = param.label || cmd;
  let store = param.store && this.storage || false;
  let store_key = `cmd_parse_${canonical(cmd)}`;
  if (store) {
    assert(param.set);
    let init_value = this.storage.getJSON(store_key);
    if (init_value !== undefined) {
      param.set(init_value);
    }
  }
  this.cmds[canonical(cmd)] = (str, resp_func) => {
    function value() {
      resp_func(null, `${label} = ${param.get()}`);
    }
    function usage() {
      resp_func(`Usage: /${cmd} ${TYPE_NAME[param.type]}`);
    }
    if (!str) {
      if (param.get) {
        return value();
      } else {
        return usage();
      }
    }
    if (!param.set) {
      return resp_func(`Usage: /${cmd}`);
    }
    let n = Number(str);
    if (param.range) {
      if (n < param.range[0]) {
        n = param.range[0];
      } else if (n > param.range[1]) {
        n = param.range[1];
      }
    }
    let store_value = n;
    if (param.type === TYPE_INT) {
      if (!isInteger(n)) {
        return usage();
      }
      param.set(n);
    } else if (param.type === TYPE_FLOAT) {
      if (!isFinite(n)) {
        return usage();
      }
      param.set(n);
    } else {
      store_value = str;
      param.set(str);
    }
    if (store) {
      this.storage.setJSON(store_key, store_value);
    }
    if (param.get) {
      return value();
    } else {
      return resp_func(null, `${label} udpated`);
    }
  };
};

CmdParse.prototype.TYPE_INT = TYPE_INT;
CmdParse.prototype.TYPE_FLOAT = TYPE_FLOAT;
CmdParse.prototype.TYPE_STRING = TYPE_STRING;

export function create(params) {
  return new CmdParse(params);
}
