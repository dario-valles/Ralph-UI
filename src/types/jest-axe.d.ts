declare module 'jest-axe' {
  export function configureAxe(options?: any): any
  export const toHaveNoViolations: any
  export function axe(element: Element | string, options?: any): Promise<any>
}

declare global {
  namespace Vi {
    interface Assertion {
      toHaveNoViolations(): void
    }
    interface AsymmetricMatchersContaining {
      toHaveNoViolations(): any
    }
  }
}
