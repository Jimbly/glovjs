import {
  canonical,
  CmdRespFunc,
  formatUsage,
} from 'glov/common/cmd_parse';
import { Roles } from 'glov/common/types';
import { cmd_parse } from './cmds';

export type CmdAutoCompleteEntry = {
  cname: string;
  cmd: string;
  help: string;
  usage?: string;
};

function cmpCmd(a: { cname: string }, b: { cname: string }): number {
  if (a.cname < b.cname) {
    return -1;
  }
  return 1;
}

export function cmdAutoComplete(str_in: string, access: Roles | null): CmdAutoCompleteEntry[] {
  let list: CmdAutoCompleteEntry[] = [];
  let str = str_in.split(' ');
  let first_tok = canonical(str[0]);
  cmd_parse.last_access = access;
  for (let cname in cmd_parse.cmds_for_complete) {
    if (str.length === 1 && cname.slice(0, first_tok.length) === first_tok ||
      str.length > 1 && cname === first_tok
    ) {
      let cmd_data = cmd_parse.cmds_for_complete[cname]!;
      if (cmd_parse.checkAccess(cmd_data.access_show) && cmd_parse.checkAccess(cmd_data.access_run)) {
        list.push({
          cname,
          cmd: cmd_data.name,
          help: String(cmd_data.help),
          usage: formatUsage(cmd_data.usage, cmd_data.help, cmd_data.prefix_usage_with_help),
        });
      }
    }
  }
  list.sort(cmpCmd);
  return list; // .slice(0, 20); Maybe?
}

function cmdDesc(cmd_data: CmdAutoCompleteEntry): string {
  return `**/${cmd_data.cmd}** - ${cmd_data.help}`;
}

cmd_parse.register({
  cmd: 'help',
  help: 'Searches commands',
  func: function (
    this: { access: Roles | null },
    str: string,
    resp_func: CmdRespFunc,
  ): void {
    let list = cmdAutoComplete('', this && this.access);
    if (str) {
      let str_cname = cmd_parse.canonical(str);
      let str_lc = str.toLowerCase();
      list = list.filter((cmd_data) => cmd_data.cname.indexOf(str_cname) !== -1 ||
          cmd_data.help.toLowerCase().indexOf(str_lc) !== -1);
    }
    if (!list.length) {
      return void resp_func(null, `No commands found matching "${str}"`);
    }
    resp_func(null, list.map(cmdDesc).join('\n'));
  }
});
