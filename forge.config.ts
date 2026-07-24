import type { ForgeConfig } from '@electron-forge/shared-types';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.adityalingwal.stayfree',
    icon: process.platform === 'darwin' ? './src/assets/appIcon.icns' : undefined,
    // Ship the compiled native helper as a plain file in Contents/Resources
    // (NOT inside app.asar — you cannot exec a binary from within asar). The
    // main process resolves it via process.resourcesPath when packaged.
    extraResource: ['./src/assets/space-watcher'],
  },
  rebuildConfig: {},
  hooks: {
    // Compile the macOS space-watcher helper (native/space-watcher.m) into
    // src/assets so CopyWebpackPlugin bundles it. macOS-only; skipped elsewhere.
    generateAssets: async () => {
      if (process.platform !== 'darwin') return;
      const src = path.resolve(__dirname, 'native', 'space-watcher.m');
      const out = path.resolve(__dirname, 'src', 'assets', 'space-watcher');
      execFileSync('clang', [
        '-framework', 'Cocoa',
        '-framework', 'CoreGraphics',
        '-fobjc-arc',
        '-O2',
        src,
        '-o', out,
      ], { stdio: 'inherit' });
      // eslint-disable-next-line no-console
      console.log('[forge] compiled space-watcher ->', out);
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      // The dev-server error overlay paints a fullscreen black panel over every
      // window. Our windows are chromeless transparent overlays (widget, error
      // bubble region), so it shows up as a giant black box floating over the
      // desktop. Compile errors still print to the terminal; runtime errors go
      // to the DevTools console.
      devServer: {
        client: {
          overlay: false,
        },
      },
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.ts',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
