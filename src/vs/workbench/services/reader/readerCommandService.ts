import { Event } from '../../../base/common/event.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ICommandService, CommandsRegistry } from '../../../platform/commands/common/commands.js';
/** Command dispatch remains local; an unknown command never activates a host. */
export class ReaderCommandService implements ICommandService {
 declare readonly _serviceBrand: undefined;
 readonly onWillExecuteCommand = Event.None; readonly onDidExecuteCommand = Event.None;
 constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) { }
 async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
  const command = CommandsRegistry.getCommand(id);
  if (!command) { throw new Error(`Unavailable reader command: ${id}`); }
  return this.instantiationService.invokeFunction(command.handler, ...args) as T;
 }
}
