import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
    client: '@hey-api/client-fetch',
    input: 'https://scalr.io/api/iacp/v3/napi-public.yml',
    output: {
        format: 'prettier',
        lint: 'eslint',
        path: './src/api'
    },
    types: {
        // dates: 'types+transform',
        enums: 'javascript'
    },
    services: {
        filter: '^\\w+ /(accounts|workspaces|runs|plans|applies)'
    }
});
