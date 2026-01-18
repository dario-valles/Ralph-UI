declare module 'jest-axe' {
  import type { AxeResults, RunOptions } from 'axe-core'

  export interface ConfigureAxeOptions extends RunOptions {
    globalOptions?: Record<string, unknown>
  }

  export function configureAxe(options?: ConfigureAxeOptions): typeof axe
  export const toHaveNoViolations: {
    toHaveNoViolations(): { pass: boolean; message: () => string }
  }
  export function axe(element: Element | string, options?: RunOptions): Promise<AxeResults>
}

declare global {
  namespace Vi {
    interface Assertion {
      toHaveNoViolations(): void
    }
    interface AsymmetricMatchersContaining {
      toHaveNoViolations(): { pass: boolean; message: () => string }
    }
  }
}
