export default {
    client: '@hey-api/client-axios',
    input: 'https://scalr.io/api/iacp/v3/openapi-public.yml',
    output: {
        format: 'prettier',
        lint: 'eslint',
        path: './src/api',
    },
    types: {
        // dates: 'types+transform',
        enums: 'javascript',
    },
    services: {
        filter: '^\\w+ /(accounts|workspaces|runs|plans|applies|environments)',
    },
};
