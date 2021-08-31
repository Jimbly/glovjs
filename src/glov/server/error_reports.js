const metrics = require('./metrics.js');
const { ipFromRequest } = require('./request_utils.js');

export function errorReportsInit(app) {
  app.post('/api/errorReport', function (req, res, next) {
    let ip = ipFromRequest(req);
    req.query.ip = ip;
    req.query.ua = req.headers['user-agent'];
    console.info('errorReport', req.query);
    res.end('OK');
    metrics.add('client.error_report', 1);
  });
  app.post('/api/errorLog', function (req, res, next) {
    let ip = ipFromRequest(req);
    req.query.ip = ip;
    req.query.ua = req.headers['user-agent'];
    console.info('errorLog', req.query);
    res.end('OK');
    metrics.add('client.error_report', 1);
  });
}
