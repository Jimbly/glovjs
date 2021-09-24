const assert = require('assert');
const request = require('request');
const { createHmac } = require('crypto');
const { serverConfig } = require('./server_config.js');
const { executeWithRetry } = require('./execute_with_retry.js');

const BASE_GRAPH_URL = 'https://graph.fb.gg';
const MAX_RETRIES = 3; // Max number of retry attempts
const BASE_RETRY_BACKOFF_DURATION = 500; // To avoid breaching 200 calls/user/hour policy
const MAX_RETRY_BACKOFF_DURATION = 10000; // Max backoff duration after each retry attempt

let app_secret;
let access_token;
let access_token_url_parameter;

export function facebookUtilsInit() {
  app_secret = process.env.FACEBOOK_ACCESS_TOKEN ||
    serverConfig().facebook && serverConfig().facebook.access_token;
  access_token = process.env.FACEBOOK_GRAPH_ACCESS_TOKEN ||
    serverConfig().facebook && serverConfig().facebook.graph_access_token;

  access_token_url_parameter = `access_token=${access_token}`;
}

export function facebookGraphRequest(path, url_parameters_string, resp_func) {
  assert(access_token, 'Missing facebook.graph_access_token in config/server.json');

  if (url_parameters_string) {
    url_parameters_string = `${access_token_url_parameter}&${url_parameters_string}`;
  } else {
    url_parameters_string = access_token_url_parameter;
  }
  const url = `${BASE_GRAPH_URL}/${path}?${url_parameters_string}`;

  function makeRequest(handler) {
    request({ url, json: true }, (err, response, body) => {
      if (err || response?.statusCode !== 200 || !body) {
        err = err || body?.error?.message;
        if (!err) {
          err = body?.error ? JSON.stringify(body?.error) : 'Request failed';
        }
        return handler(err);
      }
      return handler(null, body);
    });
  }

  const log_prefix = `Facebook | graphRequest | ${path}`;
  executeWithRetry(makeRequest, MAX_RETRIES, BASE_RETRY_BACKOFF_DURATION, MAX_RETRY_BACKOFF_DURATION, log_prefix,
    resp_func);
}

// Returns the payload contained in the signed data if the signature is valid,
// or null otherwise.
export function facebookGetPayloadFromSignedData(signed_data) {
  assert(app_secret, 'Missing facebook.access_token in config/server.json');

  try {
    const signatureComponents = signed_data.split('.');
    const signature = Buffer.from(signatureComponents[0], 'base64').toString('hex');
    const generated_signature = createHmac('sha256', app_secret).update(signatureComponents[1]).digest('hex');
    if (generated_signature === signature) {
      return JSON.parse(Buffer.from(signatureComponents[1], 'base64').toString('utf8'));
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Gets specific fields from the app-scoped user id.
// resp_func is called with an error as the first argument if any occurs,
// and with the resulting object as the second argument.
export function facebookGetUserFieldsFromASIDAsync(asid, fields, resp_func) {
  facebookGraphRequest(asid, `fields=${fields}`, resp_func);
}

// Gets the instant game player id from the app-scoped user id.
// resp_func is called with an error as the first argument if any occurs,
// and with the player id as the second argument.
export function facebookGetPlayerIdFromASIDAsync(asid, resp_func) {
  facebookGetUserFieldsFromASIDAsync(asid, 'instant_game_player_id', (err, result) => {
    if (err || !result?.instant_game_player_id) {
      return resp_func(err || 'No player id available');
    }
    return resp_func(null, result.instant_game_player_id);
  });
}

// Gets the app-scoped user id from the user token.
// resp_func is called with an error as the first argument if any occurs,
// and with the user id as the second argument.
function facebookGetASIDFromUserTokenAsync(user_token, resp_func) {
  facebookGraphRequest('debug_token', `input_token=${user_token}`, (err, result) => {
    if (err || !result) {
      return resp_func(err || 'Request failed');
    }
    let data = result.data;
    if (!(data && data.app_id && data.is_valid && data.user_id)) {
      return resp_func('Invalid token');
    }
    return resp_func(null, data.user_id);
  });
}

// Gets the app-scoped user id from the login data if valid.
// resp_func is called with an error as the first argument if the token is invalid
// or any other error occurs, and with the user id as the second argument.
export function facebookGetASIDFromLoginDataAsync(data, resp_func) {
  let signed_data = data.signedRequest;
  let token = data.token || data.accessToken;
  if (!(signed_data || token)) {
    return resp_func('No signed request or user access token defined in the login data');
  }

  // Validate login credentials
  if (signed_data) {
    let payload = facebookGetPayloadFromSignedData(signed_data);
    if (!payload?.user_id) {
      return resp_func('Bad signature');
    }
    return resp_func(null, payload.user_id);
  } else {
    return facebookGetASIDFromUserTokenAsync(token, function (err, asid) {
      if (err || !asid) {
        return resp_func(err || 'User id not defined');
      }
      return resp_func(null, asid);
    });
  }
}
