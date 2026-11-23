import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { readJson, str, type Config } from './config.ts';
import { result } from './io.ts';

const stdio = z.object({
  type: z.literal('stdio'),
  command: str,
  args: z.array(str),
});
const http = z.object({ type: z.literal('http'), url: str });
export async function discover(transport: Transport) {
  const client = new Client({ name: 'figma-o11-readiness', version: '1' });
  const deadline = AbortSignal.timeout(12000);
  try {
    await client.connect(transport, { signal: deadline, timeout: 12000 });
    const names: string[] = [];
    let tokenDescription = '';
    let cursor: string | undefined;
    do {
      const list = await client.listTools(
        { cursor },
        { signal: deadline, timeout: 12000 },
      );
      names.push(...list.tools.map((t) => t.name));
      tokenDescription ||=
        list.tools.find((t) => t.name === 'createSessionToken')?.description ??
        '';
      cursor = list.nextCursor;
    } while (cursor);
    const announced =
      (client.getInstructions() ?? '') + '\n' + tokenDescription;
    return {
      names,
      server: client.getServerVersion()?.name,
      contract: announced.match(/MCP contract (\d+)/i)?.[1] ?? null,
    };
  } finally {
    await client.close();
  }
}
export async function readiness(c: Config, probe: typeof discover = discover) {
  const entries = z
    .object({
      mcpServers: z.record(str, z.discriminatedUnion('type', [stdio, http])),
    })
    .parse(readJson('.mcp.json')).mcpServers;
  return Promise.all(
    ['figma', 'servicestudio', 'playwright'].map(async (name) => {
      try {
        const entry = entries[name];
        if (!entry)
          return {
            name,
            ...result('BLOCKED', 'Missing project MCP registration'),
          };
        let transport: Transport;
        if (entry.type === 'stdio')
          transport = new StdioClientTransport({
            command: entry.command,
            args: entry.args,
            stderr: 'ignore',
          });
        else {
          const url = entry.url.replace(
            /\$\{O11_MCP_ENDPOINT:-([^}]+)\}/g,
            (_, fallback: string) => process.env.O11_MCP_ENDPOINT ?? fallback,
          );
          if (name === 'servicestudio' && url !== c.outsystems.mcpEndpoint)
            return {
              name,
              ...result('BLOCKED', 'Claude endpoint and run config differ'),
            };
          transport = new StreamableHTTPClientTransport(new URL(url), {
            requestInit: { signal: AbortSignal.timeout(12000) },
          });
        }
        const { names, server, contract } = await probe(transport);
        return {
          name,
          ...result(
            names.length ? 'PASS' : 'BLOCKED',
            names.length
              ? 'MCP initialization and tool listing completed'
              : 'No tools advertised',
          ),
          server,
          contract,
          toolCount: names.length,
          tools: names,
        };
      } catch (error) {
        const s = String(error);
        if (/unauthorized|401|403|authoriz/i.test(s))
          return {
            name,
            ...result(
              'NEEDS_APPROVAL',
              'Authenticate or grant access in Claude /mcp',
            ),
          };
        return {
          name,
          ...result('BLOCKED', 'Connection or tool discovery failed'),
        };
      }
    }),
  );
}
