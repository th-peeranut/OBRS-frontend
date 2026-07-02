declare namespace google {
  namespace accounts {
    namespace id {
      function initialize(config: Record<string, unknown>): void;
      function renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    }
  }
}
