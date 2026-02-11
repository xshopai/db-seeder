import chalk from 'chalk';

export interface LoggerOptions {
  service?: string;
  timestamp?: boolean;
  colors?: boolean;
}

export class Logger {
  private options: LoggerOptions;

  constructor(options: LoggerOptions = {}) {
    this.options = {
      timestamp: true,
      colors: true,
      ...options,
    };
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = this.options.timestamp ? `[${new Date().toISOString()}]` : '';

    const service = this.options.service ? `[${this.options.service}]` : '';

    let formattedMessage = `${timestamp} ${service} ${level}: ${message}`;

    if (data) {
      formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
    }

    return formattedMessage;
  }

  info(message: string, data?: any): void {
    const formatted = this.formatMessage('INFO', message, data);
    console.log(this.options.colors ? chalk.blue(formatted) : formatted);
  }

  success(message: string, data?: any): void {
    const formatted = this.formatMessage('SUCCESS', message, data);
    console.log(this.options.colors ? chalk.green(formatted) : formatted);
  }

  warn(message: string, data?: any): void {
    const formatted = this.formatMessage('WARN', message, data);
    console.log(this.options.colors ? chalk.yellow(formatted) : formatted);
  }

  error(message: string, data?: any): void {
    const formatted = this.formatMessage('ERROR', message, data);
    console.log(this.options.colors ? chalk.red(formatted) : formatted);
  }

  debug(message: string, data?: any): void {
    const formatted = this.formatMessage('DEBUG', message, data);
    console.log(this.options.colors ? chalk.gray(formatted) : formatted);
  }

  step(step: number, total: number, message: string): void {
    const progress = `[${step}/${total}]`;
    const formatted = `${progress} ${message}`;
    console.log(this.options.colors ? chalk.cyan(formatted) : formatted);
  }

  header(message: string): void {
    const separator = '='.repeat(60);
    console.log(this.options.colors ? chalk.bold.magenta(separator) : separator);
    console.log(this.options.colors ? chalk.bold.magenta(message) : message);
    console.log(this.options.colors ? chalk.bold.magenta(separator) : separator);
  }

  table(data: any[]): void {
    console.table(data);
  }
}

export const logger = new Logger({ service: 'SEEDER' });
