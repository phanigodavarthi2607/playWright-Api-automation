import winston from 'winston';
import config, { ENV } from './config.js';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, agent, ...meta }) => {
  const agentTag = agent ? `[${agent}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level} [${ENV}] ${agentTag} ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: config.agent.logLevel,
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
    new winston.transports.File({
      filename: `${config.paths.reports}/agent.log`,
      maxsize: 5_242_880,
      maxFiles: 5,
    }),
  ],
});

export function createAgentLogger(agentName) {
  return logger.child({ agent: agentName });
}

export default logger;
