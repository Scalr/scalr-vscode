/* eslint-disable @typescript-eslint/no-require-imports */
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'eval-cheap-source-map',
    plugins: [new CleanWebpackPlugin()],
});
