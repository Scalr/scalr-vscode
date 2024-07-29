import { createClient } from '@hey-api/client-fetch';

export const initClient = (accountName: string, token: string) => {
    const config = {
        baseUrl: `https://${accountName}.scalr.io/api/iacp/v3/`,
        headers: {
            Authorization: `Bearer ${token}`
        }
    };

    return createClient(config);
};
