// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

function canonical(cmd) {
  return cmd.toLowerCase().replace(/[_.]/gu, '');
}

class CmdParse {
  constructor() {
    this.cmds = {};
    this.was_not_found = false;
  }
  handle(self, str, resp_func) {
    this.was_not_found = false;
    let m = str.match(/^([^\s]+)(?:\s+(.*))?$/u);
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
    this.cmds[cmd].call(self, m[2], resp_func);
    return true;
  }

  register(cmd, func) {
    this.cmds[canonical(cmd)] = func;
  }
}

export function create() {
  return new CmdParse();
}
