import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }, { loader: 'postcss-loader' }],
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
      // framer-motion optionally requires this (styled-components interop) and
      // falls back gracefully at runtime, but webpack still emits a
      // "Module not found" WARNING that trips the dev-server overlay.
      // `false` = resolve to an empty module.
      '@emotion/is-prop-valid': false,
    },
  },
};
