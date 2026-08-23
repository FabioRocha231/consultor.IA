const winston = require("winston");
const jsonFormat = require("./json");

class Logger {
  logger = console;
  static _instance;
  constructor() {
    if (Logger._instance) return Logger._instance;
    this.logger = this.getWinstonLogger();
    Logger._instance = this;
  }

  getWinstonLogger() {
    const logger = winston.createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: winston.format.combine(jsonFormat, winston.format.json()),
      transports: [new winston.transports.Console()],
    });

    function write(level, args) {
      const first = args[0];
      let message = "";
      if (typeof first === "string") message = args.shift();
      else if (first instanceof Error) {
        message = first.stack;
        args.shift();
      }
      const metadata = args.length ? { args } : undefined;
      logger[level](message || "log", metadata);
    }

    console.log = function (...args) {
      write("info", args);
    };
    console.error = function (...args) {
      write("error", args);
    };
    console.info = function (...args) {
      write("warn", args);
    };
    console.warn = function (...args) {
      write("warn", args);
    };
    return logger;
  }
}

/**
 * Sets and overrides Console methods for logging when called.
 * This is a singleton method and will not create multiple loggers.
 * @returns {winston.Logger} - instantiated logger interface.
 */
function setLogger() {
  return new Logger().logger;
}
module.exports = setLogger;
module.exports.getLogger = () => new Logger().logger;
