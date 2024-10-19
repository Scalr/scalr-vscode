import { client } from './services.gen';
import * as qs from 'qs';
import { showErrorMessage } from './error';
import * as vscode from 'vscode';
import { Axios, AxiosProxyConfig } from 'axios';
import { URL } from 'url';

function getProxySettings(): AxiosProxyConfig | false {
    const config = vscode.workspace.getConfiguration('http');
    const proxy =
        config.get<string>('proxy') ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        process.env.HTTPS_PROXY ||
        process.env.https_proxy;
    if (proxy) {
        const proxyUrl = new URL(proxy);
        return {
            host: proxyUrl.hostname,
            port: parseInt(proxyUrl.port),
            protocol: proxyUrl.protocol,
            auth: proxyUrl.username ? { username: proxyUrl.username, password: proxyUrl.password } : undefined,
        };
    }
    return false;
}

export const initClient = (accountName: string, token: string) => {
    client.instance.interceptors.response.use(
        (response) => response,
        (error) => {
            showErrorMessage(error);
            return Promise.reject(error);
        }
    );

    const proxy = getProxySettings();

    return client.setConfig({
        baseURL: `https://${accountName}.scalr.io/api/iacp/v3`,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-type': 'application/vnd.api+json',
        },
        paramsSerializer: (params) => {
            return qs.stringify(params, { arrayFormat: 'comma' });
        },
        timeout: 3000, //miliseconds
        proxy: proxy,
        throwOnError: false,
    });
};
