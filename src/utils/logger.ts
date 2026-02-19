import baseLogger from 'pino'

export const logger = baseLogger({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
})
