import { overrideHttpModule } from './http/override'
import { overrideXhrModule } from './XMLHttpRequest/override'

export const overrideModules = [overrideHttpModule, overrideXhrModule]
