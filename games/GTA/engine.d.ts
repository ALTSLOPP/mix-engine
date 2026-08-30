declare interface Engine {
  sceneManager: any;
  input: any;
  viewport: any;
  worldOrigin: any;
}

declare function registerGameLogic(callback: (engine: Engine) => void): void;
