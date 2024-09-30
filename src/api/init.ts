import { client } from '../api/services.gen';

export const initClient = (accountName: string, token: string) => {
    client.setConfig({
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
