export interface TauriAppConfig {
  title: string;
  version: string;
  width?: number;
  height?: number;
  fullscreen?: boolean;
  resizable?: boolean;
}

export class TauriConfigBuilder {
  static generateTauriConf(config: TauriAppConfig): Record<string, unknown> {
    return {
      package: {
        productName: config.title,
        version: config.version,
      },
      build: {
        distDir: '../dist',
        devPath: 'http://localhost:5173',
      },
      tauri: {
        windows: [
          {
            title: config.title,
            width: config.width ?? 1920,
            height: config.height ?? 1080,
            fullscreen: config.fullscreen ?? false,
            resizable: config.resizable ?? true,
          },
        ],
        bundle: {
          active: true,
          identifier: `com.mixengine.${config.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        },
      },
    };
  }
}
