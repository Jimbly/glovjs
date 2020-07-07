// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const metrics = require('./metrics.js');
const path = require('path');
const { serverConfig } = require('./server_config.js');
const { inspect } = require('util');
const winston = require('winston');

let dumpToFile = false;
let log_dir = './logs/';
let last_uid = 0;
let pid = process.pid;
let logger = {};

const LOG_LEVELS = {
  debug: 4,
  log: 3,
  info: 2,
  warn: 1,
  error: 0,
};

export function dumpJSON(prefix, data, ext) {
  if (dumpToFile) {
    let filename = path.join(log_dir, `${prefix}-${process.pid}-${++last_uid}.${ext || 'log'}`);
    fs.writeFile(filename, JSON.stringify(data), function (err) {
      if (err) {
        console.error(`Error writing to log file ${filename}`, err);
      }
    });
    return filename;
  } else {
    let crash_id = `${prefix}-${++last_uid}`;
    logger.log('error', crash_id, data);
    return `GKE:${crash_id}`;
  }
}

export function debug(message, ...args) {
  logger.log('debug', message, args.length === 0 ? null : (args.length === 1 ? args[0] : args));
}

export function info(message, ...args) {
  logger.log('info', message, args.length === 0 ? null : (args.length === 1 ? args[0] : args));
}

export function warn(message, ...args) {
  logger.log('warn', message, args.length === 0 ? null : (args.length === 1 ? args[0] : args));
}

export function error(message, ...args) {
  logger.log('error', message, args.length === 0 ? null : (args.length === 1 ? args[0] : args));
}

function argProcessor(arg) {
  if (typeof arg === 'object') {
    return inspect(arg, { breakLength: Infinity });
  }
  return arg;
}

let inited = false;
export function startup(params) {
  if (inited) {
    return;
  }
  params = params || {};
  inited = true;
  let options = { transports: [] };

  let server_config = serverConfig();
  let config_log = server_config.log || {};
  let level = config_log.level || 'debug';
  if (params.transports) {
    options.transports = options.transports.concat(params.transports);
  } else {
    // Console logger
    dumpToFile = true;
    let timestamp_format = config_log.timestamp_format;
    let format = server_config.log && server_config.log.format;
    let args = [];
    args.push(winston.format.metadata());
    if (timestamp_format === 'long') {
      args.push(winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZZ' }));
    } else {
      args.push(winston.format.timestamp({ format: 'HH:mm:ss' }));
      args.push(winston.format.padLevels());
    }
    if (format === 'dev' || !format && argv.dev) {
      args.push(winston.format.colorize());
      args.push(
        winston.format.printf(function (data) {
          let meta = Object.keys(data.metadata).length !== 0 ? ` | ${inspect(data.metadata)}` : '';
          return `[${data.timestamp}] ${data.level} ${data.message} ${meta}`;
        })
      );
    } else {
      args.push(
        winston.format.printf(function (data) {
          let meta = Object.keys(data.metadata).length !== 0 ? ` | ${inspect(data.metadata)}` : '';
          return `[${data.timestamp} - ${last_uid++}] ${pid} ${data.level} ${data.message} ${meta}`;
        })
      );
    }
    options.transports.push(
      new winston.transports.Console({
        level,
        format: winston.format.combine(...args),
      })
    );
  }

  logger = winston.createLogger(options);
  //debug('TESTING DEBUG LEVEL');
  //info('TESTING INFO LEVEL');
  //warn('TESTING WARN LEVEL', { foo: 'bar' });
  //error('TESTING ERROR LEVEL', { foo: 'bar' }, { baaz: 'quux' });

  if (dumpToFile && !fs.existsSync(log_dir)) {
    console.info(`Creating ${log_dir}...`);
    fs.mkdirSync(log_dir);
  }

  Object.keys(LOG_LEVELS).forEach(function (fn) {
    let logfn = logger.log.bind(logger, fn === 'log' ? 'info' : fn);
    let metric = `log.${fn}`;
    console[fn] = function (...args) {
      let msg = (args || []).map(argProcessor).join(' ');
      metrics.add(metric, 1);
      logfn(msg);
    };
  });

  //console.debug('TESTING DEBUG LEVEL');
  //console.info('TESTING INFO LEVEL');
  //console.warn('TESTING WARN LEVEL', { foo: 'bar' });
  //console.error('TESTING WARN LEVEL', { foo: 'bar' }, { baaz: 'quux' });
}
