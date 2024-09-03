const winston = require('winston');
require('winston-daily-rotate-file');
const expressWinston = require('express-winston');

var visitTransport = new (winston.transports.DailyRotateFile)({
  filename: 'log/visit/%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json())
});
var errorTransport = new (winston.transports.DailyRotateFile)({
  filename: 'log/error/%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json())
});
expressWinston.requestWhitelist.push('cf_ip');
expressWinston.requestWhitelist.push('connection.remoteAddress');
module.exports.visitReq = (req, res) => expressWinston.logger({ transports: [visitTransport] });
module.exports.errorReq = (req, res) => expressWinston.errorLogger({ transports: [errorTransport] });
module.exports.log = winston.createLogger({ transports: [errorTransport] });
