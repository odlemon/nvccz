// @ts-nocheck

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
  }
  
  interface LogEntry {
    level: LogLevel
    message: string
    timestamp: Date
    context?: Record<string, any>
  }
  
  class Logger {
    private logLevel: LogLevel
  
    constructor(logLevel: LogLevel = LogLevel.INFO) {
      this.logLevel = logLevel
    }
  
    private shouldLog(level: LogLevel): boolean {
      return level <= this.logLevel
    }
  
    private formatMessage(entry: LogEntry): string {
      const timestamp = entry.timestamp.toISOString()
      const levelName = LogLevel[entry.level]
      const context = entry.context ? ` ${JSON.stringify(entry.context)}` : ""
  
      return `[${timestamp}] ${levelName}: ${entry.message}${context}`
    }
  
    private log(level: LogLevel, message: string, context?: Record<string, any>): void {
      if (!this.shouldLog(level)) return
  
      const entry: LogEntry = {
        level,
        message,
        timestamp: new Date(),
        context,
      }
  
      const formattedMessage = this.formatMessage(entry)
  
      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage)
          break
        case LogLevel.WARN:
          console.warn(formattedMessage)
          break
        case LogLevel.INFO:
          console.info(formattedMessage)
          break
        case LogLevel.DEBUG:
          console.debug(formattedMessage)
          break
      }
    }
  
    public error(message: string, context?: Record<string, any>): void {
      this.log(LogLevel.ERROR, message, context)
    }
  
    public warn(message: string, context?: Record<string, any>): void {
      this.log(LogLevel.WARN, message, context)
    }
  
    public info(message: string, context?: Record<string, any>): void {
      this.log(LogLevel.INFO, message, context)
    }
  
    public debug(message: string, context?: Record<string, any>): void {
      this.log(LogLevel.DEBUG, message, context)
    }
  
    public setLogLevel(level: LogLevel): void {
      this.logLevel = level
    }
  }
  
  export const logger = new Logger(process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO)
  