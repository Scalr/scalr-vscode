import { IVSCodeExtLogger } from '@vscode-logging/logger';
import { createClient } from '@hey-api/client-fetch';

export const initClient = (accountName: string, token: string, logger: IVSCodeExtLogger) => {
    const client = createClient({
        baseUrl: `https://${accountName}.scalr.io/api/iacp/v3/`,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-type': 'application/vnd.api+json',
        },
        querySerializer: {
            array: { explode: false, style: 'form' },
        },
    });

    client.interceptors.response.use((response: Response): Response => {
        if (response.ok) {
            return response;
        }

        response
            .clone()
            .json()
            .then((json) => {
                const respJson = JSON.stringify(json, null, 2);
                if (response.status >= 400 && response.status < 500) {
                    logger.warn(`Client error: ${response.status} - ${response.statusText}. Response: ${respJson}`);
                } else if (response.status >= 500) {
                    logger.error(`Server error: ${response.status} - ${response.statusText}. Response: ${respJson}`);
                }
            });

        return response;
    });

    return client;
};
