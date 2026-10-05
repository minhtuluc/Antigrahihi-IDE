import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import type { IRemoteAgentService as RemoteContract } from '../remote/common/remoteAgentService.js';
export type { IRemoteAgentConnection, IExtensionHostExitInfo } from '../remote/common/remoteAgentService.js';
export const IRemoteAgentService = createDecorator<RemoteContract>('remoteAgentService');
/** Local workspace connection semantics, with no remote transport or host factory. */
export class ReaderLocalConnection {
 getConnection(): null { return null; }
 async getEnvironment(): Promise<null> { return null; }
 async getRawEnvironment(): Promise<null> { return null; }
 async getExtensionHostExitInfo(): Promise<never> { throw new Error('Remote extension hosts unavailable'); }
 async getRoundTripTime(): Promise<never> { throw new Error('Remote connection unavailable'); }
 async getDiagnosticInfo(): Promise<never> { throw new Error('Remote diagnostics unavailable'); }
 async endConnection(): Promise<void> { }
 async updateTelemetryLevel(): Promise<never> { throw new Error('Remote telemetry unavailable'); }
 async logTelemetry(): Promise<never> { throw new Error('Remote telemetry unavailable'); }
 async flushTelemetry(): Promise<never> { throw new Error('Remote telemetry unavailable'); }
}
