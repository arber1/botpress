import { inject, injectable } from 'inversify'
import _ from 'lodash'

import { MiddlewareConfig } from './config/bot.config'
import { ConfigProvider } from './config/config-loader'
import { TYPES } from './misc/types'
import { ModuleLoader } from './module-loader'

type MiddlewareOverride = {
  name: string
  order: number
  enabled: boolean
}

@injectable()
export class MiddlewareService {
  constructor(
    @inject(TYPES.ModuleLoader) private moduleLoader: ModuleLoader,
    @inject(TYPES.ConfigProvider) private configProvider: ConfigProvider
  ) {}

  /**
   * Get middleware for enabled bot modules
   * @param botId
   */
  async getMiddlewareForBot(botId: string) {
    const botConfig = await this.configProvider.getBotConfig(botId)
    const availableModules = await this.moduleLoader.getAvailableModules()

    const enabledBotModules = availableModules.map(module => {
      const moduleConfig = botConfig.modules.find(x => x.name === module.metadata.name)

      if (!moduleConfig || !moduleConfig.enabled) {
        return { incomingMw: [], outgoingMw: [] }
      }

      const incomingMw = module.metadata.incomingMiddleware.map(mw => {
        const f = moduleConfig.incomingMiddleware.find(x => x.name === mw.name) || { enabled: false }
        return { ...mw, ...f }
      })

      const outgoingMw = module.metadata.outgoingMiddleware.map(mw => {
        const f = moduleConfig.outgoingMiddleware.find(x => x.name === mw.name) || { enabled: false }
        return { ...mw, ...f }
      })

      return { incomingMw, outgoingMw }
    })

    const incomingMw = _.orderBy(_.flatMap(enabledBotModules, m => m.incomingMw), ['order'])
    const outgoingMw = _.orderBy(_.flatMap(enabledBotModules, m => m.outgoingMw), ['order'])

    return [...incomingMw, ...outgoingMw]
  }

  /**
   * Set middleware overrides for a bot (can re-order and enable/disable them)
   * @param botId
   */
  async setMiddlewareForBot(botId: string, middleware: MiddlewareOverride[]) {
    const botConfig = await this.configProvider.getBotConfig(botId)

    const amend = (mw: MiddlewareConfig) => {
      const override = middleware.find(x => x.name === mw.name)

      if (override) {
        return { ...mw, enabled: override.enabled, order: override.order }
      } else {
        return { ...mw, enabled: false }
      }
    }

    // TODO We discard any middleware we don't know in existing config file
    const newModules = botConfig.modules.map(module => {
      return {
        ...module,
        incomingMiddleware: _.orderBy(module.incomingMiddleware.map(amend), ['order']),
        outgoingMiddleware: _.orderBy(module.outgoingMiddleware.map(amend), ['order'])
      }
    })

    await this.configProvider.setBotConfig(botId, { ...botConfig, modules: newModules })
  }
}
