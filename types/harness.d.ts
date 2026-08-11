import "playwright-core";

declare global {
  interface Window {
    MDManager: any;
    [key: `__${string}`]: any;
  }

  interface ParentNode {
    querySelector<E extends Element = HTMLElement>(selectors: string): E;
  }

  interface Document {
    getElementById(elementId: string): HTMLElement;
    querySelector<E extends Element = HTMLElement>(selectors: string): E;
  }

  interface Element {
    closest<E extends Element = HTMLElement>(selectors: string): E;
  }
}

declare module "playwright-core" {
  interface Locator {
    boundingBox(options?: { signal?: AbortSignal; timeout?: number }): Promise<{ x: number; y: number; width: number; height: number }>;
    elementHandle(options?: { timeout?: number }): Promise<ElementHandle<HTMLElement>>;
    getAttribute(name: string, options?: { timeout?: number }): Promise<string>;
  }

  interface Page {
    viewportSize(): { width: number; height: number };
  }
}

export {};
