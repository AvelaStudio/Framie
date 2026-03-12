export type WidgetMode = "modal" | "bottomSheet";

export type WidgetContext = Record<string, unknown>;

export interface FramieOptions {
  url: string;
  mode?: WidgetMode;
  closeOnBackdrop?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export class FramieWidget {
  private isOpen = false;
  private readonly options: FramieOptions;

  constructor(options: FramieOptions) {
    this.options = options;
  }

  open(_context?: WidgetContext): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.options.onOpen?.();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.options.onClose?.();
  }

  get state(): "open" | "closed" {
    return this.isOpen ? "open" : "closed";
  }
}

export function createWidget(options: FramieOptions): FramieWidget {
  return new FramieWidget(options);
}
