export interface MapboxOfflinePlugin {
  /**
   * A simple test method that returns the given string.
   */
  echo(options: { value: string }): Promise<{ value: string }>;
}
