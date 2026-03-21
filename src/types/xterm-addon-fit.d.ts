declare module '@xterm/addon-fit' {
  import type { ITerminalAddon, Terminal } from '@xterm/xterm';

  export interface ITerminalDimensions {
    rows: number;
    cols: number;
  }

  export class FitAddon implements ITerminalAddon {
    constructor();
    activate(terminal: Terminal): void;
    dispose(): void;
    fit(): void;
    proposeDimensions(): ITerminalDimensions | undefined;
  }

  export default FitAddon;
}
