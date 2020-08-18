import { overrideHttpModule } from './interceptors/ClientRequest'
import { overrideXhrModule } from './interceptors/XMLHttpRequest'

export const overrideModules = [overrideHttpModule, overrideXhrModule]
