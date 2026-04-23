import type { FastifyInstance } from 'fastify'

const SlowRequestThresholdMs = Number(process.env.SLOW_REQUEST_THRESHOLD_MS ?? 800)

interface RequestWithStart {
  __startAtNs?: bigint
}

export function createFastifyOptions() {
  return {
    logger: {
      level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  }
}

export function registerRequestLoggingHooks(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    ;(request as RequestWithStart).__startAtNs = process.hrtime.bigint()
    reply.header('x-request-id', request.id)
  })

  app.addHook('onResponse', async (request, reply) => {
    const startAtNs = (request as RequestWithStart).__startAtNs
    if (!startAtNs) {
      return
    }

    const durationMs = Number(process.hrtime.bigint() - startAtNs) / 1_000_000
    const logPayload = {
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    }

    if (durationMs >= SlowRequestThresholdMs) {
      request.log.warn(logPayload, '慢请求告警')
      return
    }

    request.log.debug(logPayload, '请求完成')
  })
}
