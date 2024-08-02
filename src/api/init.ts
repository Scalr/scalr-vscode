import { createClient } from '@hey-api/client-fetch';

export const initClient = (accountName: string, token: string) => {
    return createClient({
        baseUrl: `https://${accountName}.scalr.io/api/iacp/v3/`,
        headers: {
            Authorization: `Bearer ${token}`,
        },
        querySerializer: {
            array: { explode: false, style: 'form' },
        },
    });
};
