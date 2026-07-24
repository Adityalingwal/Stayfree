import type { Configuration } from 'webpack';
import path from 'node:path';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }, { loader: 'postcss-loader' }],
});

rules.push({
  test: /\.(png|jpe?g|gif|svg)$/i,
  type: 'asset/resource',
});

export const rendererConfig: Configuration = {
  // Use source-map instead of eval-based devtool — eval is blocked by CSP
  devtool: 'source-map',
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: {
      // TypeScript emits CommonJS imports in this project. Point Phosphor at its
      // ESM build so the renderer bundle does not execute its CJS `exports`.
      '@phosphor-icons/react': path.resolve(
        __dirname,
        'node_modules/@phosphor-icons/react/dist/index.es.js',
      ),
      // framer-motion optionally requires this (styled-components interop) and
      // falls back gracefully at runtime, but webpack still emits a
      // "Module not found" WARNING that trips the dev-server overlay.
      // `false` = resolve to an empty module.
      '@emotion/is-prop-valid': false,
    },
  },
};
