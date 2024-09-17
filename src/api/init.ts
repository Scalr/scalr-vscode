import { createClient } from '@hey-api/client-fetch';

export const initClient = (accountName: string, token: string) => {
    return createClient({
        baseUrl: `https://${accountName}.scalr.io/api/iacp/v3/`,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-type': 'application/vnd.api+json',
        },
        querySerializer: {
            array: { explode: false, style: 'form' },
        },
    });
};
