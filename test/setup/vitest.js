import { inject } from 'vitest';
export function getTestServer() {
    const server = inject('server');
    const createUrlBuilder = (protocol) => {
        return (path = '/') => {
            return new URL(path, server[protocol]);
        };
    };
    return {
        http: {
            href: server.http,
            url: createUrlBuilder('http'),
        },
        https: {
            href: server.https,
            url: createUrlBuilder('https'),
        },
        ws: {
            href: server.ws,
            url: createUrlBuilder('ws'),
        },
        io: {
            href: server.io,
            url: createUrlBuilder('io'),
        },
    };
}
