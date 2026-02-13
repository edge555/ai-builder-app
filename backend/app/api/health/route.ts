import { getCorsHeaders, handleOptions } from '../../../lib/api';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(request: Request) {
  return Response.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { headers: getCorsHeaders(request) }
  );
}
