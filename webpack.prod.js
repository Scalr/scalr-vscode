/* eslint-disable @typescript-eslint/no-require-imports */
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'production',
});
