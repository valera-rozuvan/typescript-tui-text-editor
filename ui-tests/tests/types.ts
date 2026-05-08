export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}
