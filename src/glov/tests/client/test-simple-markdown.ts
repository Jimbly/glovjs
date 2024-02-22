import SimpleMarkdown, {
  ParserRule,
  ParserRules,
} from 'glov/client/simple-markdown';
import { TSMap } from 'glov/common/types';

// Example from docs
// let underline_rule = {
//   // Specify the order in which this rule is to be run
//   order: SimpleMarkdown.defaultRules.em.order - 0.5,
//
//   // First we check whether a string matches
//   match: function (source: string) {
//     return /^__([\s\S]+?)__(?!_)/.exec(source);
//   },
//
//   // Then parse this string into a syntax node
//   parse: function (capture, parse, state) {
//     return {
//       content: parse(capture[1], state)
//     };
//   },
// };

let renderable_regex = /^\[([^\s\]=]+)=([^\s\]]+)( [^\]]+)?\](?!\()/;
let renderable_param_regex = / ([^=]+)(?:=(?:"([^"]+)"|(\S+)))?/g;
type RenderableParam = TSMap<number | string | true>;
type RenderableContent = {
  type: string;
  key: string;
  param?: RenderableParam;
};
let renderable_rule: ParserRule = {
  order: SimpleMarkdown.defaultRules.link.order - 0.5,

  // First we check whether a string matches
  match: function (source: string) {
    return renderable_regex.exec(source);
  },

  // Then parse this string into a syntax node
  parse: function (capture, parse, state) {
    let param: RenderableParam | undefined;
    if (capture[3]) {
      param = {};
      capture[3].replace(renderable_param_regex, function (ignored: string, ...matches:string[]): string {
        let [key, val_quoted, val_basic] = matches;
        let v: number | string | true = val_quoted !== undefined ? val_quoted :
          val_basic !== undefined ? val_basic :
          true;
        if (typeof v === 'string') {
          let num = Number(v);
          if (isFinite(num)) {
            v = num;
          }
        }
        param![key] = v;
        return '';
      });
    }
    let content: RenderableContent = {
      type: capture[1],
      key: capture[2],
      param,
    };
    return {
      content,
    };
  },
};

type Writeable<T> = { -readonly [P in keyof T]: T[P] };
let rules: Writeable<ParserRules> = {
  renderable: renderable_rule,
};
// Enable rules we desire
([
  // 'heading',
  // 'nptable',
  // 'lheading',
  // 'hr',
  // 'codeBlock',
  // 'fence',
  // 'blockQuote',
  // 'list',
  // 'def',
  // 'table',
  'newline',
  'paragraph',
  'escape',
  // 'tableSeparator',
  // 'autolink',
  // 'mailto',
  // 'url',
  // 'link',
  // 'image',
  // 'reflink',
  // 'refimage',
  'em',
  'strong',
  'u',
  // 'del',
  // 'inlineCode',
  'br',
  'text',
] as const).forEach((key) => (rules[key] = SimpleMarkdown.defaultRules[key]));

let reBuiltParser = SimpleMarkdown.parserFor(rules);
function mdParse(source: string): unknown {
  let blockSource = `${source}\n\n`;
  return reBuiltParser(blockSource, { inline: false });
}

let tree = mdParse('FOO_BAR Here is [img=foo] [gt=ACCESS_AREA text="Access Areas"]' +
  ' [p=1] [img=foo scale=3 nostretch] [world=1234/info] [emoji=smile] and an *em**b**tag*.');
console.log(JSON.stringify(tree, undefined, 2));
